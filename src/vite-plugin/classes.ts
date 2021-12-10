import fse from 'fs-extra'
import type { Node, AnyNode } from 'postcss'
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

  classGenerator = classGenerator || generateName(minify.generateNameFilters, minify.upperCase)
  idGenerator = idGenerator || generateName(minify.generateNameFilters, minify.upperCase)

  requireCache()

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

      node.setPropertyWithoutEscape(
        'value',
        prefixValue(addClassesValues(node.value)) || node.value
      )
    })

    selectorRoot.walkIds((node) => {
      if (isFiltered(node.value, true)) {
        return
      }

      node.value = prefixValue(addIdValues(node.value)) || node.value
    })

  }).processSync(selector)
}

let classesValues: Set<string>
let idValues: Set<string>

export async function writeCache() {
  if (minify && minify.__cache_file__ && cache) {
    try {
      const data = {
        classes: {},
        ids: {}
      }

      classesValues.forEach((value) => {
        if (cache.classes[value] != null) {
          data.classes[value] = cache.classes[value]
        }
      })

      idValues.forEach((value) => {
        if (cache.ids[value] != null) {
          data.ids[value] = cache.ids[value]
        }
      })

      await fse.outputFile(minify.__cache_file__, `module.exports=${JSON.stringify(data)}`, 'utf8')

    } catch (e) {

    }
  }
}

function addClassesValues(value: string) {
  if (!cache.classes[value]) {
    cache.classes[value] = classGenerator.next().value
  }

  const v = cache.classes[value]

  if (minify.enableCache) {
    classesValues = classesValues || new Set()
    classesValues.add(value)
  }

  return v
}

function addIdValues(value: string) {
  if (!cache.ids[value]) {
    cache.ids[value] = idGenerator.next().value
  }

  const v = cache.ids[value]

  if (minify.enableCache) {
    idValues = idValues || new Set()
    idValues.add(value)
  }

  return v
}

function requireCache() {
  if (cache) {
    return
  }

  let _cache

  if (minify.__cache_file__) {
    try {
      const raw = require(minify.__cache_file__)

      _cache = raw.__esModule ? raw.default : raw

    } catch (e) {
    }
  }

  cache = _cache || objCache
}

function isFiltered(value: string, id?: boolean) {
  value = (id ? '#' : '.') + value

  return minify.filters.some(reg => reg.test(value))
}

function prefixValue(value) {
  if (!value) return value

  return minify.prefix + value
}

export function htmlFor(id: string) {
  if (!isFiltered(id, true)) {
    const v = addIdValues(id)

    if (v) {
      return prefixValue(v)
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

      const idv = addIdValues(val)

      return prefixValue(idv) || val
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
