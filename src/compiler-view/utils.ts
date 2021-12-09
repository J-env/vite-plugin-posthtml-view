import type { Options, Components, RtlOptions } from '../types'

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

  return tag.join('-').replace(/[^-_a-z0-9\u00A0-\uFFFF]/gi, '-').replace(/^\d/, '-')
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