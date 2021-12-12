import fse from 'fs-extra'
import type { Node, AnyNode } from 'postcss'
import postcssSafeParser from 'postcss-safe-parser'
import postcssSelectorParser from 'postcss-selector-parser'

import type { MinifyClassnames } from '../types'
import { generateName, toValidCSSIdentifier } from '../utils'
import { isDynamicSelector } from '../compiler-view/utils'

const objCache = {
  classes: {},
  ids: {}
}

let cache: Cache
let minify: MinifyClassnames

let classGenerator: Generator<string, void, unknown>
let idGenerator: Generator<string, void, unknown>

export function createGenerator(_minify: MinifyClassnames) {
  minify = minify || _minify

  requireCache()

  classGenerator = classGenerator || generateName(minify.generateNameFilters, minify.upperCase, generateClassesCallback)
  idGenerator = idGenerator || generateName(minify.generateNameFilters, minify.upperCase, generateIdCallback)
}

export function minifyClassesHandle(css: string) {
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

let classes: string[]
let ids: string[]

function generateClassesCallback(name) {
  if (!classes) {
    return true
  }

  return classes.includes(name) ? false : true
}

function generateIdCallback(name) {
  if (!ids) {
    return true
  }

  return ids.includes(name) ? false : true
}

function selectorParser(selector: string) {
  return postcssSelectorParser((selectorRoot) => {
    selectorRoot.walkClasses((node) => {
      if (isFiltered(node.value, false, false)) {
        return
      }

      let value = node.value
      let hasDynamic = false

      const values = value.replace(/\\?{\\?%(\\?:|\\?#)(.*?)\\?%\\?}/gs, (s) => {
        hasDynamic = true
        return ` ${s} `
      })

      if (hasDynamic) {
        value = values
          .split(/\s+/)
          .map((val) => {
            if (!val) return ''

            if (isFiltered(val)) {
              return val
            }

            const v = addClassesValues(val)

            return prefixValue(v) || val
          })
          .filter(Boolean)
          .join('')
          .trim()
          .replace(/({|%|:|})/g, '\\$1')

        node.setPropertyWithoutEscape('value', prefixValue(value) || value)
        return
      }

      node.setPropertyWithoutEscape(
        'value',
        prefixValue(addClassesValues(value)) || value
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

      classesValues.clear()
      idValues.clear()
      cache.classes = {}
      cache.ids = {}
      classes.length = 0
      ids.length = 0

      await fse.outputFile(minify.__cache_file__, `module.exports=${JSON.stringify(data)}`, 'utf8')

    } catch (e) {

    }
  }
}

function addClassesValues(value: string) {
  if (minify.enableCache) {
    classes = classes || Object.keys(cache.classes).map(k => cache.classes[k])
  }

  if (!cache.classes[value]) {
    cache.classes[value] = classGenerator.next().value
  }

  let v = cache.classes[value]

  if (typeof minify.classNameSlug === 'function') {
    try {
      v = toValidCSSIdentifier(minify.classNameSlug(v || value, value, false)) || v
    } catch (e) {
    }
  }

  if (minify.enableCache) {
    classesValues = classesValues || new Set()
    v && !classes.includes(v) && classes.push(v)
    classesValues.add(value)
  }

  return v
}

function addIdValues(value: string) {
  if (minify.enableCache) {
    ids = ids || Object.keys(cache.ids).map(k => cache.ids[k])
  }

  if (!cache.ids[value]) {
    cache.ids[value] = idGenerator.next().value
  }

  let v = cache.ids[value]

  if (typeof minify.classNameSlug === 'function') {
    try {
      v = toValidCSSIdentifier(minify.classNameSlug(v || value, value, true)) || v
    } catch (e) {
    }
  }

  if (minify.enableCache) {
    idValues = idValues || new Set()
    v && !ids.includes(v) && ids.push(v)
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

function isFiltered(value: string, id?: boolean, check?: boolean) {
  if (check !== false && isDynamicSelector(value)) {
    return true
  }

  value = (id ? '#' : '.') + value

  return minify.filters.some(reg => {
    if (typeof reg === 'string') {
      return reg === value
    }

    return reg.test(value)
  })
}

function prefixValue(value) {
  if (!value) return value

  return minify.prefix + value
}

export function htmlFor(id: string) {
  if (isFiltered(id, true)) {
    return
  }

  const v = addIdValues(id)

  if (v) {
    return prefixValue(v)
  }
}

export function useTagId(href: string) {
  href = href.slice(1)

  if (isFiltered(href, true)) {
    return
  }

  if (cache.ids[href]) {
    return '#' + prefixValue(cache.ids[href])
  }
}

export function joinValues(values: string, id?: boolean) {
  if (!values) return values

  if (!id) {
    values = values.replace(/\\?{\\?%(\\?:|\\?#)(.*?)\\?%\\?}/gs, (s) => ` ${s} `)
  }

  values = values
    .split(/\s+/)
    .map((val) => {
      if (!val) return ''

      if (isFiltered(val, id)) {
        return val
      }

      const v = !id ? addClassesValues(val) : addIdValues(val)

      return prefixValue(v) || val
    })
    .filter(Boolean)
    .join(' ')
    .trim()

  if (!id) {
    values = values
      .replace(/\\?%\\?}(.*?)\\?{\\?%/gs, (s, a) => {
        if (!a) return s
        return s.replace(a, ` ${a.trim()} `)
      })
      .replace(/\s+(\\?{\\?%)/g, '$1')
  }

  return values
}

interface ParserType<Child extends Node = AnyNode> {
  nodes: Child[]
}

interface Cache {
  classes: Record<string, string | void>
  ids: Record<string, string | void>
}
