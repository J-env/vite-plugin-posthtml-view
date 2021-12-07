import { Node, AnyNode } from 'postcss'
import postcssSafeParser from 'postcss-safe-parser'
import postcssSelectorParser from 'postcss-selector-parser'

import { slugify } from '../utils/slugify'
import { toValidCSSIdentifier } from '../utils'

import { OptionsUtils } from './utils'

interface ParserType<Child extends Node = AnyNode> {
  nodes: Child[]
}

export interface ScopedClasses {
  classNames: string[]
  tags: Record<string, boolean>
}

export function postcssScopedParser(css: string, resolveId: string, options: OptionsUtils) {
  const isProd = options.mode === 'production'
  const hash = slugify(`scoped-${resolveId}:` + (isProd ? css : ''))

  const scopedHash = toValidCSSIdentifier((options.styled.prefix || '') + hash)

  const ast = postcssSafeParser(css)
  const scopedClasses: ScopedClasses = {
    classNames: [],
    tags: {}
  }

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
            clearInvalidValues(rule.nodes)

            rule.selector = replaceGlobalPseudo(
              scopedParser(rule.selector, scopedHash, scopedClasses)
            )
            break;

          default:
            break;
        }
      }
    })
  }

  walkNodes(ast.nodes)

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
          if (
            node.type === 'class' &&
            !scopedClasses.classNames.includes(node.value)
          ) {
            scopedClasses.classNames.push(node.value)
          }

          if (node.type === 'tag') {
            scopedClasses.tags[node.value] = true
          }

          node.setPropertyWithoutEscape('value', `${node.value}.${scopedHash}`)
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
