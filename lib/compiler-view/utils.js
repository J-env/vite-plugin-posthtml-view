import { toValidCSSIdentifier } from '../utils';
const hyphenateReg = /\B([A-Z])/g;
export function hyphenate(str) {
    return (str || '').replace(hyphenateReg, '-$1').toLowerCase();
}
export function getTag(src) {
    let tag = src
        .replace('.html', '-html')
        .replace(/\.|_/g, '')
        .split('/')
        .map(item => hyphenate(item)).filter(Boolean);
    return toValidCSSIdentifier(tag.join('-'), '-');
}
export const dynamicReg = /\\?{\\?%(\\?:|\\?#)(.*?)\\?%\\?}/gs;
export function dynamicTest(css) {
    const bool = !!(css && dynamicReg.test(css));
    dynamicReg.lastIndex = 0;
    return bool;
}
export function isDynamicSelector(s) {
    return dynamicTest(s);
}
const fontReg = /\.(ttf|eot|woff|woff2)$/;
export function isFont(url) {
    url = url.split('#')[0];
    url = url.split('?')[0];
    return fontReg.test(url);
}
const commentReg = /\/\*(.*?)\*\//gs;
export function isDynamicCss(css) {
    css = css && css.replace(commentReg, (s) => {
        if (dynamicTest(s)) {
            return '';
        }
        return s;
    });
    return dynamicTest(css);
}
export function trimWhitespace(str) {
    return str && str.replace(/^[ \n\r\t\f]+/, '').replace(/[ \n\r\t\f]+$/, '');
}
export function trimAttrWhitespace(str, conservativeCollapse = true) {
    str = str.replace(/ ?[\n\r]+ ?/g, '')
        .replace(/\s{2,}/g, conservativeCollapse ? ' ' : '');
    return trimWhitespace(str).replace(/\s*;\s*/g, ';');
}
export function cumbersomeTrim(str) {
    return str
        .replace(/^{\s+/g, '{')
        .replace(/\s+}$/g, '}');
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
];
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
];
//# sourceMappingURL=utils.js.map