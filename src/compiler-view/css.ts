import { Node, AnyNode } from 'postcss'
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
  assetsCache: Set<string>
}

type CssUrlReplacer = (url: string, importer?: string) => string

const animationNameReg = /^(-\w+-)?animation-name$/
const animationReg = /^(-\w+-)?animation$/
const keyframesReg = /-?keyframes$/
// @see vite plugins
export const cssUrlRE = /(?<=^|[^\w\-\u0080-\uffff])url\(\s*('[^']+'|"[^"]+"|[^'")]+)\s*\)/

export const cssImageSetRE = /image-set\(([^)]+)\)/

export function postcssScopedParser(
  css: string,
  resolveId: string,
  options: OptionsUtils,
  from: string,
  start_mark: string,
  end_mark: string,
  global?: boolean
) {
  const ast = postcssSafeParser(css, {
    from: from
  })

  const scopedClasses: ScopedClasses = {
    classNames: [],
    tags: {},
    assetsCache: new Set()
  }

  const keyframes = Object.create(null)
  let walkDeclsKeyFrames = false
  let scopedHash = ''

  if (!global) {
    const _hashCleanHandle = (css: string) => {
      return css.replace(start_mark, '').replace(end_mark, '')
    }

    const isProd = options.mode === 'production'
    const hash = slugify(`scoped-${resolveId}:` + (isProd ? _hashCleanHandle(css || '') : ''))
    scopedHash = toValidCSSIdentifier((options.styled.prefix || '') + hash)

    // scoped
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
              if (keyframesReg.test(rule.name)) {
                const hasGlobal = rule.params.startsWith(':global')

                if (hasGlobal) {
                  rule.params = replaceGlobalPseudo(rule.params)

                } else {
                  const keyframe_hash = `_${hash}`

                  if (!rule.params.endsWith(keyframe_hash)) {
                    walkDeclsKeyFrames = true
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
  }

  ast.walkDecls((decl) => {
    if (walkDeclsKeyFrames) {
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
    }

    const isCssUrl = cssUrlRE.test(decl.value)
    const isCssImageSet = cssImageSetRE.test(decl.value)

    if (isCssUrl || isCssImageSet) {
      const replacerForDecl = (url: string) => {
        url = options.join(from, url)
        url = options.slash(url, true)

        scopedClasses.assetsCache.add(url)

        return url
      }

      const rewriterToUse = isCssUrl ? rewriteCssUrls : rewriteCssImageSet

      decl.value = rewriterToUse(decl.value, replacerForDecl)
    }
  })

  return {
    scopedHash,
    scopedClasses,
    css: ast.toString()
  }
}

function rewriteCssUrls(css: string, replacer: CssUrlReplacer) {
  return urlReplace(css, cssUrlRE, (match) => {
    const [matched, rawUrl] = match
    return doUrlReplace(rawUrl, matched, replacer)
  })
}

function rewriteCssImageSet(css: string, replacer: CssUrlReplacer) {
  return urlReplace(css, cssImageSetRE, (match) => {
    const [matched, rawUrl] = match
    const url = processSrcSet(rawUrl, ({ url }) => doUrlReplace(url, matched, replacer))

    return `image-set(${url})`
  })
}

export function urlReplace(
  input: string,
  re: RegExp,
  replacer: (match: RegExpExecArray) => string
): string {
  let match: RegExpExecArray | null
  let remaining = input
  let rewritten = ''

  while ((match = re.exec(remaining))) {
    rewritten += remaining.slice(0, match.index)
    rewritten += replacer(match)
    remaining = remaining.slice(match.index + match[0].length)
  }

  rewritten += remaining

  return rewritten
}

function doUrlReplace(rawUrl: string, matched: string, replacer: CssUrlReplacer) {
  let wrap = ''
  const first = rawUrl[0]

  if (first === `"` || first === `'`) {
    wrap = first
    rawUrl = rawUrl.slice(1, -1)
  }

  if (isExternalUrl(rawUrl) || isDataUrl(rawUrl) || rawUrl.startsWith('#')) {
    return matched
  }

  return `url(${wrap}${replacer(rawUrl)}${wrap})`
}

interface ImageCandidate {
  url: string
  descriptor: string
}

const escapedSpaceCharacters = /( |\\t|\\n|\\f|\\r)+/g

export function processSrcSet(srcs: string, replacer: (arg: ImageCandidate) => string): string {
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

  const ret = imageCandidates.map(({ url, descriptor }) => {
    return {
      url: replacer({ url, descriptor }),
      descriptor
    }
  })

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
