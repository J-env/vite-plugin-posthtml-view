import { Node, AnyNode } from 'postcss'
import postcssSafeParser from 'postcss-safe-parser'
import postcssSelectorParser from 'postcss-selector-parser'

import { slugify } from '../utils/slugify'
import { toValidCSSIdentifier } from '../utils'
import { StyledOptions, StyleTypeAll } from '../types'

import { ViewComponent } from './view'

interface ParserType<Child extends Node = AnyNode> {
  nodes: Child[]
}

export function postcssParser(
  css: string,
  view: ViewComponent,
  styled: StyledOptions
) {
  const componentName = view.componentName || ''

  const scopedHash = styled.type === 'scoped'
    ? toValidCSSIdentifier(slugify(`${componentName}${css}:${styled.type}`))
    : ''

  const ast = postcssSafeParser(css)

  const classNameSlug = (title: string) => {
    const hash = toValidCSSIdentifier(slugify(`${componentName}${title}:${css}:${styled.type}`))
    let className = hash

    if (typeof styled.classNameSlug === 'function') {
      try {
        className = toValidCSSIdentifier(styled.classNameSlug(
          hash,
          title,
          styled.type as StyleTypeAll
        ))

      } catch {
        throw new Error(`classNameSlug option must return a string`);
      }
    }

    return styled.displayName ? `${title}_${className}` : className
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

            const selector = postcssSelectorParser((selectorRoot) => {
              switch (styled.type) {
                // 作用域类名
                case 'scoped':
                  selectorRoot.walk((node) => {
                    if (node.type === 'class' || node.type === 'tag') {
                      const isGlobal = pseudoIsGlobal(node.parent) || pseudoIsGlobal(node.parent && node.parent.parent)

                      if (!isGlobal) {
                        view.scopedClasses[node.value] = true
                        view.scopedHash = scopedHash

                        node.setPropertyWithoutEscape('value', `${node.value}.${scopedHash}`)
                      }
                    }
                  })
                  break;

                case 'module':
                  selectorRoot.walkClasses((classNode) => {
                    const isGlobal = pseudoIsGlobal(classNode.parent) || pseudoIsGlobal(classNode.parent && classNode.parent.parent)

                    if (!isGlobal) {
                      const slug = classNameSlug(classNode.value)

                      view.hasModuleClasses = true
                      view.moduleClasses[classNode.value] = slug

                      classNode.setPropertyWithoutEscape('value', slug)
                    }
                  })
                  break;

                // 动态样式 非 ssr
                case 'dynamic':
                  selectorRoot.walkClasses((classNode) => {
                    const isGlobal = pseudoIsGlobal(classNode.parent) || pseudoIsGlobal(classNode.parent && classNode.parent.parent)

                    if (!isGlobal) {
                      const slug = classNameSlug(classNode.value)

                      view.hasDynamicClasses = true
                      view.dynamicClasses[classNode.value] = slug

                      classNode.setPropertyWithoutEscape('value', slug)
                    }
                  })
                  break;

                default:
                  break;
              }

            }).processSync(rule.selector)


            rule.selector = replaceGlobalPseudo(selector)
            break;

          default:
            break;
        }
      }
    })
  }

  walkNodes(ast.nodes)

  return {
    css: ast.toString()
  }
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
