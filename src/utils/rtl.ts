const css_janus = require('cssjanus')

import type { CssjanusOptions } from '../types'

const cache = new Map<string, string>()

const commentReg = /\/\*(.*?)\*\//gs
const placeholderReg = /--noflip-rtl-placeholder-\d+:\s*1;?/g
const cssBlockReg = /{(.*?)}/gs

export function cssjanus(_css: string, options?: CssjanusOptions): string {
  const cache_css = cache.get(_css)

  if (cache_css) {
    return cache_css
  }

  let css = placeholderToNoflip(_css)

  css = css_janus.transform(css, {
    transformDirInUrl: false,
    transformEdgeInUrl: false,
    ...options
  })

  css = css.replace(commentReg, '')

  cache.set(_css, css)

  return css
}

// `
// .float-left {                            .float-left {
//   /* @noflip */    == transform ==>         --noflip-rtl-placeholder-0: 1;
//   float: left;                              float: left;
//   /* @noflip */    == transform ==>         --noflip-rtl-placeholder-1: 1;
//   margin-left: 0;                           margin-left: 0;
// }                                        }
// `
export function noflipToPlaceholder(css: string): string {
  return css.replace(cssBlockReg, (s) => {
    let i = -1

    return s.replace(commentReg, (noflip) => {
      if (noflip.includes('@noflip')) {
        i = i + 1
        return `--noflip-rtl-placeholder-${i}:1;`
      }

      return noflip
    })
  })
}

export function placeholderToNoflip(css: string, replaceValue?: string): string {
  return css.replace(placeholderReg, replaceValue === '' ? replaceValue : '/* @noflip */')
}
