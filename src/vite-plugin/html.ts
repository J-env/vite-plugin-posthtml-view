import { minify, Options as MinifyOptions } from 'html-minifier-terser'

import type { PluginOptions } from '../types'

const defaultMinifyOptions: MinifyOptions = {
  caseSensitive: true,
  collapseBooleanAttributes: true,
  collapseInlineTagWhitespace: true,
  collapseWhitespace: true,
  // conservativeCollapse: false,
  // continueOnParseError: false,
  // customAttrAssign: [],
  // customAttrCollapse: undefined,
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
  processScripts: ['application/ld+json'],
  // quoteCharacter: undefined,
  removeAttributeQuotes: true,
  removeComments: true,
  // removeEmptyAttributes: false,
  // removeEmptyElements: false,
  // removeOptionalTags: false,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  removeTagWhitespace: false,
  // sortAttributes: false,
  // sortClassName: false,
  // trimCustomFragments: false,
  useShortDoctype: true
}

let minifyOptions: MinifyOptions

export async function minifyHtml(html: string, options: PluginOptions) {
  if (!options.minifyHtml) {
    return html
  }

  minifyOptions = minifyOptions || (options.minifyHtml === true
    ? defaultMinifyOptions
    : {
      ...defaultMinifyOptions,
      ...options.minifyHtml,
      // danger
      removeTagWhitespace: false
    }
  )

  html = await minify(html, minifyOptions)

  return replaceIdJson(html)
}

function replaceIdJson(html: string) {
  try {
    const str = html.replace(/<script type="?application\/ld\+json"?>(.*?)<\/script>/g, (s) => {
      return s.replace(/\s+(?=[:"'\[\]\{\}])/g, '')
    })

    html = str

  } catch (e) {

  }

  return html
}
