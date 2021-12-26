import type { Node, AnyNode } from 'postcss'
import postcssSafeParser from 'postcss-safe-parser'
import postcssSelectorParser from 'postcss-selector-parser'
import { JSONStorage } from 'node-localstorage'

import type { MinifyClassnames } from '../types'
import { generateName, withoutEscape } from '../utils'
import { isDynamicSelector, dynamicReg } from '../compiler-view/utils'

let minify: MinifyClassnames
let classGenerator: Generator<string, string, unknown>
let idGenerator: Generator<string, string, unknown>
let jsonStorage: JSONStorage

interface Storage {
  classesKey: '_classes'
  idsKey: '_ids'

  _classes: Record<string, string>
  _ids: Record<string, string>
  classes: Record<string, string>
  ids: Record<string, string>
}

const storage: Storage = {
  classesKey: '_classes',
  idsKey: '_ids',
  _classes: {},
  _ids: {},
  classes: {},
  ids: {},
}

const classes_set = new Set<string>()
const ids_set = new Set<string>()

function readCache(key: string): Record<string, string> {
  try {
    const data = jsonStorage.getItem(key) || {}

    return data

  } catch (e) {
    return {}
  }
}

export async function writeCache() {
  if (jsonStorage) {
    jsonStorage.setItem(storage.classesKey, storage.classes)
    jsonStorage.setItem(storage.idsKey, storage.ids)
  }
}

export function createGenerator(_minify: MinifyClassnames) {
  minify = minify || _minify

  if (minify.__cache_file__ && !jsonStorage) {
    jsonStorage = new JSONStorage(minify.__cache_file__)

    storage._classes = readCache(storage.classesKey)
    storage._ids = readCache(storage.idsKey)
  }

  classGenerator = classGenerator || generateName(
    minify.generateNameFilters,
    minify.upperCase
  )

  idGenerator = idGenerator || generateName(
    minify.generateNameFilters,
    minify.upperCase
  )
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

function selectorParser(selector: string) {
  return postcssSelectorParser((selectorRoot) => {
    selectorRoot.walkClasses((node) => {
      if (isFiltered(node.value, false, false)) {
        return
      }

      let value = node.value
      let hasDynamic = false

      const values = value.replace(dynamicReg, (s) => {
        hasDynamic = true
        return ` ${s} `
      })

      if (hasDynamic) {
        value = values
          .split(/\s+/)
          .map((val) => {
            if (!val) return ''

            // checked dynamic string
            if (isFiltered(val, false)) {
              return val
            }

            const v = addClassesValues(val)

            return prefixValue(v) || val
          })
          .filter(Boolean)
          .join('')
          .trim()

        value = withoutEscape(value)

        node.setPropertyWithoutEscape('value', value)
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

function addClassesValues(value: string) {
  const cacheValue = storage._classes[value]

  if (cacheValue) {
    delete storage._classes[value]
    storage.classes[value] = cacheValue
    classes_set.add(cacheValue)

    return cacheValue
  }

  const preValue = storage.classes[value]

  if (preValue) {
    classes_set.add(preValue)
    return preValue
  }

  function generateClasses() {
    let v = classGenerator.next().value

    if (classes_set.has(v)) {
      return generateClasses()
    }

    return v
  }

  const v = generateClasses()
  storage.classes[value] = v
  classes_set.add(v)

  return v
}

function addIdValues(value: string) {
  const cacheValue = storage._ids[value]

  if (cacheValue) {
    delete storage._ids[value]
    storage.ids[value] = cacheValue
    ids_set.add(cacheValue)

    return cacheValue
  }

  const preValue = storage.ids[value]

  if (preValue) {
    ids_set.add(preValue)
    return preValue
  }

  function generateIds() {
    let v = idGenerator.next().value

    if (ids_set.has(v)) {
      return generateIds()
    }

    return v
  }

  const v = generateIds()
  storage.ids[value] = v
  ids_set.add(v)

  return v
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

  const val = storage.ids[href]

  if (val) {
    return '#' + prefixValue(val)
  }
}

const phpReg = /\\?%\\?}(.*?)\\?{\\?%/gs
const phpReg2 = /\s+(\\?{\\?%)/g

export function joinValues(values: string, id?: boolean) {
  if (!values) return values

  if (!id) {
    values = values.replace(dynamicReg, (s) => ` ${s} `)
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
      .replace(phpReg, (s, a) => {
        if (!a) return s
        return s.replace(a, ` ${a.trim()} `)
      })
      .replace(phpReg2, '$1')
  }

  return values
}

interface ParserType<Child extends Node = AnyNode> {
  nodes: Child[]
}
