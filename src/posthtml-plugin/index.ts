import type { Node as Tree } from 'posthtml'

import { parse } from './view'
import { processWithPostHtml } from './parser'
import { Options } from '../types'

type ViewOptions = { from: string }

const stylePreprocessor: Options['stylePreprocessor'] = (css, lang) => ({
  code: css
})

/**
 * posthtml-plugin-view
 * @param options
 * @returns
 */
export function postHTMLPluginView(opts: Partial<Options> & ViewOptions) {
  const options = { ...(opts || {}) } as (Options & ViewOptions)

  options.root = options.root || process.cwd()
  options.mode = options.mode || 'development'
  options.encoding = options.encoding || 'utf8'
  options.cacheDirectory = options.cacheDirectory || '.posthtml-view-cache'
  options.viewPrefix = options.viewPrefix || 'view:'
  options.stylePreprocessor = options.stylePreprocessor || stylePreprocessor
  // global components
  options.components = options.components || {}

  options.from = options.from || ''
  options.plugins = options.plugins || []
  options.parser = options.parser || {}
  options.locals = options.locals || {}
  options.$attrs = options.$attrs || '$attrs'

  if (options.mode === 'development') {
    if (options.devCssDiv !== null) {
      options.devCssDiv = options.devCssDiv || '__development_posthtml_view_css__'
    }
  }

  options.js = {
    ...options.js
  }

  options.styled = {
    type: 'module',
    lang: 'css',
    rtl: false,
    to: 'head',
    removeDataStyledAttr: options.mode !== 'development',
    customAttributes: [],
    displayName: options.mode === 'development',
    classNameSlug: null,
    ...(options.styled || {}),
  }

  if (typeof options.getOptions === 'function') {
    options.getOptions(options)
  }

  return function (tree: Tree) {
    return Promise.resolve(parse(options)(tree))
      .then((pa) => pa)
      .then((content) => {
        return processWithPostHtml(options.parser, options.plugins, content)
      })
  }
}
