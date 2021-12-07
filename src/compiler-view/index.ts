import path from 'path'
import type { Node as Tree } from 'posthtml'

import type { Options } from '../types'

import { slash } from '../utils/slash'
import { OptionsUtils } from './utils'
import { processWithPostHtml, parseGlobalComponents } from './parser'
import { parse } from './view'

export function compilerViewPlugin(_options: Partial<Options>) {
  const options = { ...(_options || {}) } as OptionsUtils

  options.root = options.root || process.cwd()
  options.mode = options.mode || 'development'
  options.encoding = options.encoding || 'utf8'
  options.cacheDirectory = options.cacheDirectory || '.posthtml-view-cache'
  options.viewPrefix = options.viewPrefix || 'view:'

  options.from = options.from || ''
  options.plugins = options.plugins || []
  options.parser = options.parser || {}
  options.locals = options.locals || {}
  options.$attrs = options.$attrs || '$attrs'

  options.stylePreprocessor = options.stylePreprocessor || ((css) => ({ code: css }))

  options.js = {
    type: 'ts',
    ...options.js
  }

  options.styled = {
    type: 'scoped',
    to: 'head',
    prefix: 'view-',
    classNameSlug: null,
    ...options.styled,
  }

  if (typeof options.getOptions === 'function') {
    options.getOptions(options)
  }

  // private utils
  options.join = (from, src) => {
    return path.join(
      path.isAbsolute(src) ? options.root : path.dirname(from || options.from),
      src
    )
  }

  /**
   * ensure the path is normalized in a way that is consistent inside
   * project (relative to root) and on different systems.
   * @private
   */
  options.slash = (src) => {
    return slash(path.normalize(path.relative(options.root, src)))
  }

  options.prefix = (str) => `${options.viewPrefix}${str}`

  // options.components = {}

  return async function compilerTree(tree: Tree) {
    // register global components
    options.components = await parseGlobalComponents(options)

    const parsed = await parse(options)(tree)

    return await processWithPostHtml(options.parser, options.plugins, parsed)
  }
}
