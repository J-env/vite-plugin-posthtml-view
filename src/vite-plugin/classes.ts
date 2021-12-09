import { Node, AnyNode } from 'postcss'
import postcssSafeParser from 'postcss-safe-parser'
import postcssSelectorParser from 'postcss-selector-parser'

import type { PluginOptions, MinifyClassnames } from '../types'
import { generateName } from '../utils'

const objCache = {
  classes: {},
  ids: {}
}

let cache: Cache
let minify: MinifyClassnames

let classGenerator: Generator<string, void, unknown>
let idGenerator: Generator<string, void, unknown>

export function minifyClassesHandle(css: string, _minify: MinifyClassnames, options: PluginOptions) {
  minify = minify || _minify

  cache = cache || (minify.enableCache ? requireCache() : objCache)

  classGenerator = classGenerator || generateName(minify.generateNameFilters, minify.upperCase)
  idGenerator = idGenerator || generateName(minify.generateNameFilters, minify.upperCase)

  const ast = postcssSafeParser(css)

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
            rule.selector = selectorParser(rule.selector)
            break;

          default:
            break;
        }
      }
    })
  }

  walkNodes(ast.nodes)

  return ast.toString()
}

function selectorParser(selector: string) {
  return postcssSelectorParser((selectorRoot) => {
    selectorRoot.walkClasses((node) => {
      if (isFiltered(node.value)) {
        return
      }

      if (!cache.classes[node.value]) {
        cache.classes[node.value] = classGenerator.next().value
      }

      node.setPropertyWithoutEscape('value', prefixValue(cache.classes[node.value]))
    })

    selectorRoot.walkIds((node) => {
      if (isFiltered(node.value, true)) {
        return
      }

      if (!cache.ids[node.value]) {
        cache.ids[node.value] = idGenerator.next().value
      }

      node.value = prefixValue(cache.ids[node.value]) || node.value
    })

  }).processSync(selector)
}

function isFiltered(value: string, id?: boolean) {
  value = (id ? '#' : '.') + value

  return minify.filters.some(reg => reg.test(value))
}

function prefixValue(value) {
  return minify.prefix + value
}

export function htmlFor(id: string) {
  if (!isFiltered(id, true)) {
    if (!cache.ids[id]) {
      cache.ids[id] = idGenerator.next().value
    }

    if (cache.ids[id]) {
      return prefixValue(cache.ids[id])
    }
  }
}

export function useTagId(href: string) {
  href = href.slice(1)

  if (!isFiltered(href, true)) {
    if (cache.ids[href]) {
      return '#' + prefixValue(cache.ids[href])
    }
  }
}

export function joinValues(values: string, id?: boolean) {
  if (!values) return values

  return values
    .split(/\s+/)
    .map((val) => {
      if (isFiltered(val, id)) {
        return val
      }

      if (!id) {
        return prefixValue(cache.classes[val]) || val
      }

      if (!cache.ids[val]) {
        cache.ids[val] = idGenerator.next().value
      }

      return prefixValue(cache.ids[val]) || val
    })
    .filter(Boolean)
    .join(' ')
    .trim()
}

interface ParserType<Child extends Node = AnyNode> {
  nodes: Child[]
}

interface Cache {
  classes: Record<string, string | void>
  ids: Record<string, string | void>
}

function requireCache(): Cache {
  if (cache) return cache

  try {
    // @todo
    return require('.json')

  } catch (e) {
    return objCache
  }
}
