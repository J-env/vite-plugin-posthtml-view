import type { Options, Components, RtlOptions } from '../types'

import { toValidCSSIdentifier } from '../utils'

/**
 * @private
 */
export type OptionsUtils = Options & {
  /**
   * @private
   */
  join(from: string, src: string): string

  /**
   * ensure the path is normalized in a way that is consistent inside
   * project (relative to root) and on different systems.
   * @private
   */
  slash(src: string, sl?: boolean): string

  /**
   * @private
   */
  prefix(str: string): string

  cssjanus(css: string): string

  noflip(css: string): string

  /**
   * @private
   */
  components: Components

  rtl: false | RtlOptions
}

const hyphenateReg = /\B([A-Z])/g

export function hyphenate(str: string) {
  return (str || '').replace(hyphenateReg, '-$1').toLowerCase()
}

export function getTag(src: string) {
  let tag = src
    .replace('.html', '-html')
    .replace(/\.|_/g, '')
    .split('/')
    .map(item => hyphenate(item)).filter(Boolean)

  return toValidCSSIdentifier(tag.join('-'), '-')
}

export const dynamicReg = /\\?{\\?%(\\?:|\\?#)(.*?)\\?%\\?}/gs

export function dynamicTest(css: string) {
  const bool = !!(css && dynamicReg.test(css))

  dynamicReg.lastIndex = 0

  return bool
}

export function isDynamicSelector(s: string): boolean {
  return dynamicTest(s)
}

const commentReg = /\/\*(.*?)\*\//gs

export function isDynamicCss(css: string): boolean {
  css = css && css.replace(commentReg, (s) => {
    if (dynamicTest(s)) {
      return ''
    }

    return s
  })

  return dynamicTest(css)
}

export const htmlElements = [
  'a',
  'abbr',
  'acronym',
  'address',
  'applet',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'basefont',
  'bdi',
  'bdo',
  'bgsound',
  'big',
  'blink',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'center',
  'cite',
  'code',
  'col',
  'colgroup',
  'content',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'font',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'isindex',
  'kbd',
  'keygen',
  'label',
  'legend',
  'li',
  'link',
  'listing',
  'main',
  'map',
  'mark',
  'marquee',
  'menu',
  'menuitem',
  'meta',
  'meter',
  'nav',
  'nobr',
  'noframes',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'param',
  'picture',
  'plaintext',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'rtc',
  'ruby',
  's',
  'samp',
  'script',
  'section',
  'select',
  'shadow',
  'slot',
  'small',
  'source',
  'spacer',
  'span',
  'strike',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'tt',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
  'xmp'
]

export const svgElements = [
  'a',
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'color-profile',
  'defs',
  'desc',
  'discard',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  "feDropShadow",
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'foreignObject',
  'g',
  "hatch",
  "hatchpath",
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'mesh',
  'meshgradient',
  'meshpatch',
  'meshrow',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'script',
  'set',
  'solidcolor',
  'stop',
  'style',
  'svg',
  'switch',
  'symbol',
  'text',
  'textPath',
  'title',
  'tspan',
  'unknown',
  'use',
  'view'
]
