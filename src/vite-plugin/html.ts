import { minify, Options as MinifyOptions } from 'html-minifier-terser'

import type { PluginOptions } from '../types'

const defaultMinifyOptions: MinifyOptions = {
  caseSensitive: true,
  collapseBooleanAttributes: true,
  collapseInlineTagWhitespace: true,
  collapseWhitespace: true,
  conservativeCollapse: false,
  // continueOnParseError: false,
  // customAttrAssign: [],
  // customAttrCollapse: /x-data|:class/,
  // customAttrSurround: [],
  // customEventAttributes: [],
  // decodeEntities: false,
  html5: true,
  // ignoreCustomComments: [],
  // ignoreCustomFragments: [],
  // includeAutoGeneratedTags: true,
  // keepClosingSlash: false,
  // maxLineLength: undefined,
  minifyCSS: true,
  minifyJS: true,
  minifyURLs: true,
  noNewlinesBeforeTagClose: true,
  // preserveLineBreaks: false,
  // preventAttributesEscaping: false,
  // processConditionalComments: false,
  // processScripts: ['application/ld+json'],
  // quoteCharacter: undefined,
  removeAttributeQuotes: true,
  removeComments: true,
  removeEmptyAttributes: false,
  // removeEmptyElements: false,
  // removeOptionalTags: false,
  removeRedundantAttributes: false,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,

  // danger
  removeTagWhitespace: false,

  // sortAttributes: false,
  // sortClassName: false,
  // trimCustomFragments: false,
  useShortDoctype: true,
}

let minifyOptions: MinifyOptions

export async function minifyHtml(html: string, options: PluginOptions) {
  if (typeof options.minifyHtml === 'function') {
    options.minifyHtml = options.minifyHtml(defaultMinifyOptions)
  }

  if (!options.minifyHtml) {
    return html
  }

  minifyOptions = minifyOptions || (options.minifyHtml === true
    ? defaultMinifyOptions
    : {
      ...defaultMinifyOptions,
      ...options.minifyHtml,
      // danger
      removeTagWhitespace: false,
    }
  )

  html = await minify(html, minifyOptions)

  if (typeof options.minifyHtmlAfter === 'function') {
    html = options.minifyHtmlAfter(html)

  } else {
    html = html.replace(/>(\s+)</g, '><')
  }

  return html
}

