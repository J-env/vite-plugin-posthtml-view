import { Node, AnyNode } from 'postcss'
import postcssSafeParser from 'postcss-safe-parser'
import postcssSelectorParser from 'postcss-selector-parser'

import { slugify } from '../utils/slugify'
import { toValidCSSIdentifier } from '../utils'

import { OptionsUtils, isDynamicCss } from './utils'

interface ParserType<Child extends Node = AnyNode> {
  nodes: Child[]
}

export interface ScopedClasses {
  classNames: string[]
  tags: Record<string, boolean>
}

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
            if (isDynamicCss(value)) {
              value = value.replace(/({|%|:|})/g, '\\$1')
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

function replaceGlobalPseudo(str: string) {
  return str.replace(/:global\((.*?)\)/gs, '$1')
}
