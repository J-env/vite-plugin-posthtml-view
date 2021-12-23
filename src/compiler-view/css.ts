import { Node, AnyNode, PluginCreator } from 'postcss'
import postcssSafeParser from 'postcss-safe-parser'
import postcssSelectorParser from 'postcss-selector-parser'

import { toValidCSSIdentifier, withoutEscape, isExternalUrl, isDataUrl } from '../utils'
import { slugify } from '../utils/slugify'

import { OptionsUtils, isDynamicSelector } from './utils'

interface ParserType<Child extends Node = AnyNode> {
  nodes: Child[]
}

export interface ScopedClasses {
  classNames: string[]
  tags: Record<string, boolean>
}

type CssUrlReplacer = (url: string, importer?: string) => string | Promise<string>

const animationNameReg = /^(-\w+-)?animation-name$/
const animationReg = /^(-\w+-)?animation$/

export function postcssScopedParser(
  css: string,
  resolveId: string,
  options: OptionsUtils,
  from: string,
  start_mark: string,
  end_mark: string
) {
  const _hashCleanHandle = (css: string) => {
    return css.replace(start_mark, '').replace(end_mark, '')
  }

  const isProd = options.mode === 'production'
  const hash = slugify(`scoped-${resolveId}:` + (isProd ? _hashCleanHandle(css || '') : ''))
  const scopedHash = toValidCSSIdentifier((options.styled.prefix || '') + hash)

  const ast = postcssSafeParser(css, {
    from: from
  })

  const scopedClasses: ScopedClasses = {
    classNames: [],
    tags: {}
  }

  const keyframes = Object.create(null)
  let isWalkDecls = false

  function walkNodes(nodes: ParserType['nodes']) {
    nodes.forEach((rule) => {
      if (
        rule.type === 'atrule' &&
        (rule.name === 'media' || rule.name === 'supports')
      ) {
        walkNodes(rule.nodes)

      } else {
        switch (rule.type) {
          case 'rule':
            if ([start_mark, end_mark].includes(rule.selector + '{}')) {
              return
            }

            clearInvalidValues(rule.nodes)

            rule.selector = replaceGlobalPseudo(
              scopedParser(rule.selector, scopedHash, scopedClasses)
            )
            break;

          case 'atrule':
            if (/-?keyframes$/.test(rule.name)) {
              const hasGlobal = rule.params.startsWith(':global')

              if (hasGlobal) {
                rule.params = replaceGlobalPseudo(rule.params)

              } else {
                const keyframe_hash = `_${hash}`

                if (!rule.params.endsWith(keyframe_hash)) {
                  isWalkDecls = true
                  keyframes[rule.params] = rule.params = rule.params + keyframe_hash
                }
              }
            }
            break;

          default:
            break;
        }
      }
    })
  }

  walkNodes(ast.nodes)

  if (isWalkDecls) {
    ast.walkDecls((decl) => {
      // @see: vue-sfc-scoped
      if (animationNameReg.test(decl.prop)) {
        decl.value = decl.value
          .split(',')
          .map(v => keyframes[v.trim()] || v.trim())
          .join(',')
      }

      if (animationReg.test(decl.prop)) {
        decl.value = decl.value
          .split(',')
          .map(v => {
            const vals = v.trim().split(/\s+/)

            const i = vals.findIndex(val => keyframes[val])

            if (i !== -1) {
              vals.splice(i, 1, keyframes[vals[i]])
              return vals.join(' ')

            } else {
              return v
            }
          })
          .join(',')
      }
    })
  }

  return {
    scopedHash,
    scopedClasses,
    css: ast.toString()
  }
}

// @see vite plugins
export const cssUrlRE = /(?<=^|[^\w\-\u0080-\uffff])url\(\s*('[^']+'|"[^"]+"|[^'")]+)\s*\)/

export const cssImageSetRE = /image-set\(([^)]+)\)/

export const urlRewritePostcssPlugin: PluginCreator<{
  replacer: CssUrlReplacer
}> = (opts) => {

  if (!opts) {
    return {
      postcssPlugin: 'postcss-url-rewrite',
    }
  }

  return {
    postcssPlugin: 'postcss-url-rewrite',
    Once(root) {
      const promises: Promise<void>[] = []

      root.walkDecls((decl) => {
        const isCssUrl = cssUrlRE.test(decl.value)
        const isCssImageSet = cssImageSetRE.test(decl.value)

        if (isCssUrl || isCssImageSet) {
          const replacerForDecl = (rawUrl: string) => {
            const importer = decl.source?.input.file
            return opts.replacer(rawUrl, importer)
          }

          const rewriterToUse = isCssUrl ? rewriteCssUrls : rewriteCssImageSet

          promises.push(
            rewriterToUse(decl.value, replacerForDecl)
              .then((url) => {
                decl.value = url
              })
          )
        }
      })

      if (promises.length) {
        return Promise.all(promises) as any
      }
    }
  }
}

urlRewritePostcssPlugin.postcss = true

function rewriteCssUrls(css: string, replacer: CssUrlReplacer): Promise<string> {
  return asyncReplace(css, cssUrlRE, async (match) => {
    const [matched, rawUrl] = match
    return await doUrlReplace(rawUrl, matched, replacer)
  })
}

function rewriteCssImageSet(css: string, replacer: CssUrlReplacer): Promise<string> {
  return asyncReplace(css, cssImageSetRE, async (match) => {
    const [matched, rawUrl] = match
    const url = await processSrcSet(rawUrl, ({ url }) => doUrlReplace(url, matched, replacer))

    return `image-set(${url})`
  })
}

export async function asyncReplace(
  input: string,
  re: RegExp,
  replacer: (match: RegExpExecArray) => string | Promise<string>
): Promise<string> {
  let match: RegExpExecArray | null
  let remaining = input
  let rewritten = ''

  while ((match = re.exec(remaining))) {
    rewritten += remaining.slice(0, match.index)
    rewritten += await replacer(match)
    remaining = remaining.slice(match.index + match[0].length)
  }

  rewritten += remaining

  return rewritten
}

async function doUrlReplace(rawUrl: string, matched: string, replacer: CssUrlReplacer) {
  let wrap = ''
  const first = rawUrl[0]

  if (first === `"` || first === `'`) {
    wrap = first
    rawUrl = rawUrl.slice(1, -1)
  }

  if (isExternalUrl(rawUrl) || isDataUrl(rawUrl) || rawUrl.startsWith('#')) {
    return matched
  }

  return `url(${wrap}${await replacer(rawUrl)}${wrap})`
}

interface ImageCandidate {
  url: string
  descriptor: string
}

const escapedSpaceCharacters = /( |\\t|\\n|\\f|\\r)+/g

export async function processSrcSet(
  srcs: string,
  replacer: (arg: ImageCandidate) => Promise<string>
): Promise<string> {
  const imageCandidates: ImageCandidate[] = srcs
    .split(',')
    .map((s) => {
      const [url, descriptor] = s
        .replace(escapedSpaceCharacters, ' ')
        .trim()
        .split(' ', 2)

      return { url, descriptor }
    })
    .filter(({ url }) => !!url)

  const ret = await Promise.all(
    imageCandidates.map(async ({ url, descriptor }) => {
      return {
        url: await replacer({ url, descriptor }),
        descriptor
      }
    })
  )

  return ret.reduce((prev, { url, descriptor }, index) => {
    descriptor = descriptor || ''

    return (prev += url + ` ${descriptor}${index === ret.length - 1 ? '' : ', '}`)
  }, '')
}

function scopedParser(
  selector: string,
  scopedHash: string,
  scopedClasses: ScopedClasses
) {
  return postcssSelectorParser((selectorRoot) => {
    selectorRoot.walk((node) => {
      if (node.type === 'class' || node.type === 'tag') {
        const isGlobal = pseudoIsGlobal(node.parent) || pseudoIsGlobal(node.parent && node.parent.parent)

        if (!isGlobal) {
          let value = node.value

          if (node.type === 'class') {
            // Dynamic selector
            if (isDynamicSelector(value)) {
              value = withoutEscape(value)
            }

            if (!scopedClasses.classNames.includes(value)) {
              scopedClasses.classNames.push(value)
            }
          }

          if (node.type === 'tag') {
            scopedClasses.tags[value] = true
          }

          node.setPropertyWithoutEscape('value', `${value}.${scopedHash}`)
        }
      }
    })

  }).processSync(selector)
}

function clearInvalidValues(nodes: ParserType['nodes']) {
  nodes.forEach((node) => {
    if (node.type === 'decl' && ['undefined', 'null'].includes(node.value)) {
      node.remove()
      node.cleanRaws()
    }
  })
}

function pseudoIsGlobal(node) {
  return !!(node && node.type === 'pseudo' && node.value === ':global')
}

const globalReg = /:global\((.*?)\)/gs

function replaceGlobalPseudo(str: string) {
  return str.replace(globalReg, '$1')
}
