import type { Node as Tree } from 'posthtml'

import type { Options } from '../types'

import { joinPath, slashPath } from '../utils/slash'
import { cssjanus, noflipToPlaceholder } from '../utils/rtl'
import { OptionsUtils } from './utils'
import { processWithPostHtml, parseGlobalComponents } from './parser'
import { parse } from './view'

export function compilerViewPlugin(_options: Partial<Options>) {
  const options = { ...(_options || {}) } as OptionsUtils

  options.root = options.root || process.cwd()
  options.mode = options.mode || 'development'
  options.encoding = options.encoding || 'utf8'
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

  options.assets = {
    ...options.assets
  }

  options.assets.attributes = options.assets.attributes || ['data-src', 'data-img']

  options.styled = {
    type: 'scoped',
    to: 'head',
    prefix: 'view-',
    ...options.styled,
  }

  if (typeof options.getOptions === 'function') {
    options.getOptions(options)
  }

  /**
   * @private
   */
  options.join = (from, src) => joinPath(options.root, options.from, from, src)

  /**
   * ensure the path is normalized in a way that is consistent inside
   * project (relative to root) and on different systems.
   * @private
   */
  options.slash = (src, sl) => slashPath(options.root, src, sl)

  /**
   * @private
   */
  options.prefix = (str) => `${options.viewPrefix}${str}`

  /**
  * @private
  */
  options.rtl = options.rtl || false

  /**
   * @private
   */
  options.cssjanus = (css) => {
    if (options.rtl && options.mode === 'development') {
      return cssjanus(css, {
        transformEdgeInUrl: options.rtl.transformEdgeInUrl,
        transformDirInUrl: options.rtl.transformDirInUrl
      })
    }

    return css
  }

  /**
   * @private
   */
  options.noflip = (css) => {
    if (options.rtl) {
      return noflipToPlaceholder(css)
    }

    return css
  }

  // options.components = {}

  return async function compilerTree(tree: Tree) {
    // register global components
    options.components = await parseGlobalComponents(options)

    const parsed = await parse(options)(tree)

    return await processWithPostHtml(options.parser, options.plugins, parsed)
  }
}
