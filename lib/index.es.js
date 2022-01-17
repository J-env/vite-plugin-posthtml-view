import { createDecipheriv, createCipheriv } from 'crypto';
import path from 'path';
import posthtml from 'posthtml';
import expressions from 'posthtml-expressions';
import match from 'posthtml-match-helper';
import { render } from 'posthtml-render';
import { merge } from 'lodash';
import fse from 'fs-extra';
import postcss from 'postcss';
import postcssrc from 'postcss-load-config';
import postcssSafeParser from 'postcss-safe-parser';
import postcssSelectorParser from 'postcss-selector-parser';
import history from 'connect-history-api-fallback';
import fg from 'fast-glob';
import shell from 'shelljs';
import circular from 'circular';
import execa from 'execa';
import { minify as minify$1 } from 'html-minifier-terser';
import { createFilter } from '@rollup/pluginutils';
import { JSONStorage } from 'node-localstorage';

function doHash(str, seed = 0) {
  const m = 1540483477;
  const r = 24;
  let length = str.length;
  let h = seed ^ length;
  let currentIndex = 0;
  while (length >= 4) {
    let k = UInt32(str, currentIndex);
    k = Umul32(k, m);
    k ^= k >>> r;
    k = Umul32(k, m);
    h = Umul32(h, m);
    h ^= k;
    currentIndex += 4;
    length -= 4;
  }
  switch (length) {
    case 3:
      h ^= UInt16(str, currentIndex);
      h ^= str.charCodeAt(currentIndex + 2) << 16;
      h = Umul32(h, m);
      break;
    case 2:
      h ^= UInt16(str, currentIndex);
      h = Umul32(h, m);
      break;
    case 1:
      h ^= str.charCodeAt(currentIndex);
      h = Umul32(h, m);
      break;
  }
  h ^= h >>> 13;
  h = Umul32(h, m);
  h ^= h >>> 15;
  return h >>> 0;
}
function UInt32(str, pos) {
  return str.charCodeAt(pos++) + (str.charCodeAt(pos++) << 8) + (str.charCodeAt(pos++) << 16) + (str.charCodeAt(pos) << 24);
}
function UInt16(str, pos) {
  return str.charCodeAt(pos++) + (str.charCodeAt(pos++) << 8);
}
function Umul32(n, m) {
  n |= 0;
  m |= 0;
  const nlo = n & 65535;
  const nhi = n >>> 16;
  const res = nlo * m + ((nhi * m & 65535) << 16) | 0;
  return res;
}
function slugify(code) {
  return doHash(code).toString(36);
}

const validCSSReg = /[^-_a-z0-9\u00A0-\uFFFF]/gi;
const startsWithNumberReg = /^\d/;
function toValidCSSIdentifier(s, l) {
  if (!s)
    return s;
  return s.replace(validCSSReg, l || "_").replace(startsWithNumberReg, l || "_");
}
const externalRE = /^(https?:)?\/\//;
const isExternalUrl = (url) => externalRE.test(url);
const dataUrlRE = /^\s*data:/i;
const isDataUrl = (url) => dataUrlRE.test(url);
const withoutEscapeReg = /({|%|:|})/g;
function withoutEscape(val) {
  return val.replace(withoutEscapeReg, "\\$1");
}
function* generateName(filters = [], upperCase = true, returnCallback) {
  returnCallback = returnCallback || ((_) => true);
  let abc = "abcdefghijklmnopqrstuvwxyz";
  if (upperCase) {
    abc = abc + abc.toUpperCase();
  }
  const digital = "0123456789";
  const str = abc + digital;
  const abc_len = abc.length;
  const str_len = str.length;
  filters = [...filters || [], /ad/i];
  let i = 0;
  let num = 0;
  while (true) {
    let base = abc_len;
    let name = "";
    do {
      name = name + str.charAt(num % base);
      num = ~~(num / base);
      base = str_len;
    } while (num > 0);
    if (!filters.some((reg) => reg.test(name)) && returnCallback(name)) {
      yield name;
    }
    i++;
    num = i;
  }
}

function joinPath(root, rootFrom, from, src) {
  return path.join(path.isAbsolute(src) ? root : path.dirname(from || rootFrom), src);
}
function slashPath(root, src, sl) {
  src = slash(path.normalize(path.relative(root, src)));
  return sl ? src[0] === "/" ? src : `/${src}` : src;
}
function slash(path2) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path2);
  const hasNonAscii = /[^\u0000-\u0080]+/.test(path2);
  if (isExtendedLengthPath || hasNonAscii) {
    return path2;
  }
  return path2.replace(/\\/g, "/");
}

const css_janus = require("cssjanus");
const cache = new Map();
const commentReg$1 = /\/\*(.*?)\*\//gs;
const placeholderReg = /--noflip-rtl-placeholder-\d+:\s*1;?/g;
const cssBlockReg = /{(.*?)}/gs;
function cssjanus(_css, options) {
  const cache_css = cache.get(_css);
  if (cache_css) {
    return cache_css;
  }
  let css = placeholderToNoflip(_css);
  css = css_janus.transform(css, {
    transformDirInUrl: false,
    transformEdgeInUrl: false,
    ...options
  });
  css = css.replace(commentReg$1, "");
  cache.set(_css, css);
  return css;
}
function noflipToPlaceholder(css) {
  return css.replace(cssBlockReg, (s) => {
    let i = -1;
    return s.replace(commentReg$1, (noflip) => {
      if (noflip.includes("@noflip")) {
        i = i + 1;
        return `--noflip-rtl-placeholder-${i}:1;`;
      }
      return noflip;
    });
  });
}
function placeholderToNoflip(css, replaceValue) {
  return css.replace(placeholderReg, replaceValue === "" ? replaceValue : "/* @noflip */");
}

const alpineJsReg = /^(?:x-|v-|:|@)/;
const hyphenateReg = /\B([A-Z])/g;
function hyphenate(str) {
  return (str || "").replace(hyphenateReg, "-$1").toLowerCase();
}
function getTag(src) {
  let tag = src.replace(".html", "-html").replace(/\.|_/g, "").split("/").map((item) => hyphenate(item)).filter(Boolean);
  return toValidCSSIdentifier(tag.join("-"), "-");
}
const dynamicReg = /\\?{\\?%(\\?:|\\?#)(.*?)\\?%\\?}/gs;
function dynamicTest(css) {
  const bool = !!(css && dynamicReg.test(css));
  dynamicReg.lastIndex = 0;
  return bool;
}
function isDynamicSelector(s) {
  return dynamicTest(s);
}
const fontReg = /\.(ttf|eot|woff|woff2)$/;
function isFont(url) {
  url = url.split("#")[0];
  url = url.split("?")[0];
  return fontReg.test(url);
}
const commentReg = /\/\*(.*?)\*\//gs;
function isDynamicCss(css) {
  css = css && css.replace(commentReg, (s) => {
    if (dynamicTest(s)) {
      return "";
    }
    return s;
  });
  return dynamicTest(css);
}
function trimWhitespace(str) {
  return str && str.replace(/^[ \n\r\t\f]+/, "").replace(/[ \n\r\t\f]+$/, "");
}
function trimAttrWhitespace(str, conservativeCollapse = true) {
  str = str.replace(/ ?[\n\r]+ ?/g, "").replace(/\s{2,}/g, conservativeCollapse ? " " : "");
  return trimWhitespace(str).replace(/\s*;\s*/g, ";");
}
const htmlElements = [
  "a",
  "abbr",
  "acronym",
  "address",
  "applet",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "basefont",
  "bdi",
  "bdo",
  "bgsound",
  "big",
  "blink",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "content",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "font",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "isindex",
  "kbd",
  "keygen",
  "label",
  "legend",
  "li",
  "link",
  "listing",
  "main",
  "map",
  "mark",
  "marquee",
  "menu",
  "menuitem",
  "meta",
  "meter",
  "nav",
  "nobr",
  "noframes",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "picture",
  "plaintext",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "rtc",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "shadow",
  "slot",
  "small",
  "source",
  "spacer",
  "span",
  "strike",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "tt",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
  "xmp"
];
const svgElements = [
  "a",
  "animate",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "color-profile",
  "defs",
  "desc",
  "discard",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "foreignObject",
  "g",
  "hatch",
  "hatchpath",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "mesh",
  "meshgradient",
  "meshpatch",
  "meshrow",
  "metadata",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "script",
  "set",
  "solidcolor",
  "stop",
  "style",
  "svg",
  "switch",
  "symbol",
  "text",
  "textPath",
  "title",
  "tspan",
  "unknown",
  "use",
  "view"
];

function parseTemplate(node, component, options) {
  return function(tree) {
    const componentContent = node.content || [];
    const slotNodes = {};
    if (componentContent.length) {
      tree.match.call(componentContent, match("template"), (node2) => {
        if (!node2.attrs)
          return node2;
        if (!node2.attrs.slot)
          return node2;
        slotNodes[node2.attrs.slot] = node2;
        return node2;
      });
    }
    const _content = tree.match(match("slot"), (slot) => {
      const name = slot.attrs && slot.attrs.name || "";
      if (!name) {
        return mergeContent(slot.content, componentContent.filter((node2) => {
          return !(node2["tag"] === "template" && node2["attrs"] && node2["attrs"]["slot"]);
        }));
      }
      const slotNode = slotNodes[name];
      if (slotNode) {
        return mergeContent(slot.content, slotNode.content, getTemplateType(slotNode));
      }
      return slot.content || [];
    });
    node.tag = false;
    node.content = _content;
    return tree;
  };
}
function mergeContent(slotContent, templateContent, type) {
  slotContent = Array.isArray(slotContent) ? slotContent : [slotContent || ""];
  templateContent = Array.isArray(templateContent) ? templateContent : [templateContent || ""];
  switch (type) {
    case "replace":
      slotContent = templateContent;
      break;
    case "prepend":
      slotContent = [...templateContent, ...slotContent];
      break;
    case "append":
      slotContent = [...slotContent, ...templateContent];
      break;
    default:
      slotContent = templateContent.filter(Boolean).length === 0 ? slotContent : templateContent;
      break;
  }
  return slotContent;
}
function getTemplateType(templateNode) {
  let blockType = templateNode.attrs && templateNode.attrs.type || "";
  if (!["replace", "prepend", "append"].includes(blockType)) {
    blockType = "replace";
  }
  return blockType;
}
function processWithPostHtml(options, plugins, content, prepend) {
  return posthtml((prepend || []).concat(plugins)).process(render(content), options).then((result) => result.tree);
}
function parseAttrsToLocals(component, attrs, options, isPage) {
  const $attrs = {};
  Object.entries(attrs || {}).forEach(([key, value]) => {
    $attrs[key] = transformValue(value);
  });
  const env = {
    MODE: options.mode,
    DEV: options.mode === "development",
    PROD: options.mode === "production",
    PAGE: options.slash(options.from, true)
  };
  const _locals = {
    [options.$attrs]: merge({}, options.locals, component.locals, $attrs, {
      env
    })
  };
  return expressions({ locals: _locals });
}
function transformValue(value) {
  try {
    return new Function(`return ${value}`)();
  } catch (err) {
    return value;
  }
}
let cacheComponents;
async function parseGlobalComponents({
  registerComponentsFile,
  root,
  mode,
  encoding,
  prefix,
  join,
  slash
}) {
  if (cacheComponents)
    return cacheComponents;
  if (!registerComponentsFile)
    return {};
  const components = {};
  const file = join(root, registerComponentsFile);
  const html = await fse.readFile(file, encoding);
  function matchComponents(tree) {
    tree.match(match(prefix("components")), (node) => {
      if (node.content) {
        node.content.forEach((element) => {
          if (typeof element === "string")
            return;
          let { src, ...locals } = element.attrs || {};
          if (element.tag && src) {
            src = join(file, src);
            components[element.tag] = {
              tag: element.tag,
              src,
              resolveId: slash(src),
              locals
            };
          }
        });
      }
      return node;
    });
  }
  await posthtml([]).use(matchComponents).process(html, {});
  if (mode !== "development") {
    cacheComponents = components;
  }
  return components;
}

const animationNameReg = /^(-\w+-)?animation-name$/;
const animationReg = /^(-\w+-)?animation$/;
const keyframesReg = /-?keyframes$/;
const cssUrlRE = /(?<=^|[^\w\-\u0080-\uffff])url\(\s*('[^']+'|"[^"]+"|[^'")]+)\s*\)/;
const cssImageSetRE = /image-set\(([^)]+)\)/;
function postcssScopedParser(css, resolveId, options, from, start_mark, end_mark, global) {
  const ast = postcssSafeParser(css, {
    from
  });
  const scopedClasses = {
    classNames: [],
    tags: {},
    assetsCache: new Set()
  };
  const keyframes = Object.create(null);
  let walkDeclsKeyFrames = false;
  let scopedHash = "";
  if (!global) {
    let walkNodes = function(nodes) {
      nodes.forEach((rule) => {
        if (rule.type === "atrule" && (rule.name === "media" || rule.name === "supports")) {
          walkNodes(rule.nodes);
        } else {
          switch (rule.type) {
            case "rule":
              if ([start_mark, end_mark].includes(rule.selector + "{}")) {
                return;
              }
              clearInvalidValues(rule.nodes);
              rule.selector = replaceGlobalPseudo(scopedParser(rule.selector, scopedHash, scopedClasses));
              break;
            case "atrule":
              if (keyframesReg.test(rule.name)) {
                const hasGlobal = rule.params.startsWith(":global");
                if (hasGlobal) {
                  rule.params = replaceGlobalPseudo(rule.params);
                } else {
                  const keyframe_hash = `_${hash}`;
                  if (!rule.params.endsWith(keyframe_hash)) {
                    walkDeclsKeyFrames = true;
                    keyframes[rule.params] = rule.params = rule.params + keyframe_hash;
                  }
                }
              }
              break;
          }
        }
      });
    };
    const _hashCleanHandle = (css2) => {
      return css2.replace(start_mark, "").replace(end_mark, "");
    };
    const isProd = options.mode === "production";
    const hash = slugify(`scoped-${resolveId}:` + (isProd ? _hashCleanHandle(css || "") : ""));
    scopedHash = toValidCSSIdentifier((options.styled.prefix || "") + hash);
    walkNodes(ast.nodes);
  }
  ast.walkDecls((decl) => {
    if (walkDeclsKeyFrames) {
      if (animationNameReg.test(decl.prop)) {
        decl.value = decl.value.split(",").map((v) => keyframes[v.trim()] || v.trim()).join(",");
      }
      if (animationReg.test(decl.prop)) {
        decl.value = decl.value.split(",").map((v) => {
          const vals = v.trim().split(/\s+/);
          const i = vals.findIndex((val) => keyframes[val]);
          if (i !== -1) {
            vals.splice(i, 1, keyframes[vals[i]]);
            return vals.join(" ");
          } else {
            return v;
          }
        }).join(",");
      }
    }
    const isCssUrl = cssUrlRE.test(decl.value);
    const isCssImageSet = cssImageSetRE.test(decl.value);
    if (isCssUrl || isCssImageSet) {
      const replacerForDecl = (url) => {
        url = options.join(from, url);
        url = options.slash(url, true);
        scopedClasses.assetsCache.add(url);
        return url;
      };
      const rewriterToUse = isCssUrl ? rewriteCssUrls : rewriteCssImageSet;
      decl.value = rewriterToUse(decl.value, replacerForDecl);
    }
  });
  return {
    scopedHash,
    scopedClasses,
    css: ast.toString()
  };
}
function rewriteCssUrls(css, replacer) {
  return urlReplace(css, cssUrlRE, (match) => {
    const [matched, rawUrl] = match;
    return doUrlReplace(rawUrl, matched, replacer);
  });
}
function rewriteCssImageSet(css, replacer) {
  return urlReplace(css, cssImageSetRE, (match) => {
    const [matched, rawUrl] = match;
    const url = processSrcSet(rawUrl, ({ url: url2 }) => doUrlReplace(url2, matched, replacer));
    return `image-set(${url})`;
  });
}
function urlReplace(input, re, replacer) {
  let match;
  let remaining = input;
  let rewritten = "";
  while (match = re.exec(remaining)) {
    rewritten += remaining.slice(0, match.index);
    rewritten += replacer(match);
    remaining = remaining.slice(match.index + match[0].length);
  }
  rewritten += remaining;
  return rewritten;
}
function doUrlReplace(rawUrl, matched, replacer) {
  let wrap = "";
  const first = rawUrl[0];
  if (first === `"` || first === `'`) {
    wrap = first;
    rawUrl = rawUrl.slice(1, -1);
  }
  if (isExternalUrl(rawUrl) || isDataUrl(rawUrl) || rawUrl.startsWith("#")) {
    return matched;
  }
  return `url(${wrap}${replacer(rawUrl)}${wrap})`;
}
const escapedSpaceCharacters = /( |\\t|\\n|\\f|\\r)+/g;
function processSrcSet(srcs, replacer) {
  const imageCandidates = srcs.split(",").map((s) => {
    const [url, descriptor] = s.replace(escapedSpaceCharacters, " ").trim().split(" ", 2);
    return { url, descriptor };
  }).filter(({ url }) => !!url);
  const ret = imageCandidates.map(({ url, descriptor }) => {
    return {
      url: replacer({ url, descriptor }),
      descriptor
    };
  });
  return ret.reduce((prev, { url, descriptor }, index) => {
    descriptor = descriptor || "";
    return prev += url + ` ${descriptor}${index === ret.length - 1 ? "" : ", "}`;
  }, "");
}
function scopedParser(selector, scopedHash, scopedClasses) {
  return postcssSelectorParser((selectorRoot) => {
    selectorRoot.walk((node) => {
      if (node.type === "class" || node.type === "tag") {
        const isGlobal = pseudoIsGlobal(node.parent) || pseudoIsGlobal(node.parent && node.parent.parent);
        if (!isGlobal) {
          let value = node.value;
          if (node.type === "class") {
            if (isDynamicSelector(value)) {
              value = withoutEscape(value);
            }
            if (!scopedClasses.classNames.includes(value)) {
              scopedClasses.classNames.push(value);
            }
          }
          if (node.type === "tag") {
            scopedClasses.tags[value] = true;
          }
          node.setPropertyWithoutEscape("value", `${value}.${scopedHash}`);
        }
      }
    });
  }).processSync(selector);
}
function clearInvalidValues(nodes) {
  nodes.forEach((node) => {
    if (node.type === "decl" && ["undefined", "null"].includes(node.value)) {
      node.remove();
      node.cleanRaws();
    }
  });
}
function pseudoIsGlobal(node) {
  return !!(node && node.type === "pseudo" && node.value === ":global");
}
const globalReg = /:global\((.*?)\)/gs;
function replaceGlobalPseudo(str) {
  return str.replace(globalReg, "$1");
}

let postcssrc_sync;
let processor;
const getPostcssConfigSync = () => {
  try {
    postcssrc_sync = postcssrc_sync || postcssrc.sync();
  } catch (e) {
    postcssrc_sync = {
      file: "",
      options: {},
      plugins: []
    };
  }
  processor = processor || postcss(postcssrc_sync.plugins);
};
function parse(options) {
  function parseHandle(options2, isPage) {
    return async function(tree) {
      const promises = [];
      const components = matchComponents(tree, options2);
      tree.walk((node) => {
        if (typeof node === "string") {
          return node;
        }
        if (!node.tag)
          return node;
        const attrs = node.attrs || {};
        const component = getComponent(attrs, node.tag, components, options2);
        if (component) {
          if (htmlElements.includes(component.tag)) {
            throw new Error(`The component <${component.tag}> is the HTML tag. page file: ${options2.from}`);
          } else if (svgElements.includes(component.tag)) {
            throw new Error(`The component <${component.tag}> is the SVG tag. page file: ${options2.from}`);
          }
          if (node.attrs) {
            delete node.attrs[options2.prefix("query")];
          }
          promises.push(readComponentFile(component, options2.encoding).then(parseComponent(node, component, options2)).then((tree2) => {
            const _options = {
              ...options2,
              from: component.src
            };
            return parseHandle(_options, false)(tree2);
          }).then(parseTemplate(node)));
        }
        return node;
      });
      if (isPage) {
        const resolveId = options2.slash(options2.from);
        promises.push(parseStyleAndScript(null, {
          tag: resolveId.replace(/\/|\./g, "-"),
          src: options2.from,
          resolveId,
          locals: {}
        }, options2)(tree));
      }
      if (promises.length > 0) {
        await Promise.all(promises);
        promises.length = 0;
      }
      if (isPage) {
        return await collectCssAndJs(tree, options2);
      }
      return tree;
    };
  }
  return parseHandle(options, true);
}
async function collectCssAndJs(tree, options) {
  const { styled, js, from, mode, rtl } = options;
  const isDev = mode === "development";
  const headStyleId = "@";
  const attrIdKey = "__posthtml_view_css__";
  let mainjs = "";
  const promises = [];
  if (isDev) {
    tree.match(match("body"), (node) => {
      const css_container = {
        tag: "div",
        attrs: {
          id: attrIdKey,
          "data-id": "development_css_container",
          style: "display: none !important;"
        }
      };
      node.content = [css_container, ...node.content || []];
      return node;
    });
    tree.match(match("html"), (node) => {
      node.attrs = node.attrs || {};
      node.attrs.dir = rtl ? "rtl" : "ltr";
      return node;
    });
  }
  const cache = new Map();
  const list = [];
  const extractCache = new Map();
  const extractList = [];
  const hasExtract = typeof styled.extract === "function";
  const jsExt = js.type === "ts" ? "ts" : "js";
  tree.match(match("style"), function(node) {
    const css = toString$1(node.content);
    node.attrs = node.attrs || {};
    const scopedHash = node.attrs["data-scoped-hash"] || "";
    const resolveId = node.attrs["data-resolve-id"] || "";
    let to = node.attrs["data-to"] || styled.to || "head";
    if (isDev && to !== "*") {
      to = `#${attrIdKey}`;
    }
    if ((node.attrs["data-to"] === "file" || to === "file") && hasExtract) {
      if (css && !extractCache.has(resolveId)) {
        extractCache.set(resolveId, {});
        !extractList.includes(resolveId) && extractList.push(resolveId);
        extractCache.set(resolveId, {
          to: "file",
          css,
          scopedHash,
          resolveId
        });
      }
    } else {
      if (css && !cache.has(resolveId)) {
        cache.set(resolveId, {});
        if (to === "*") {
          if (!isDev) {
            delete node.attrs["data-to"];
            delete node.attrs["data-scoped-hash"];
            delete node.attrs["data-resolve-id"];
          }
          return node;
        }
        !list.includes(resolveId) && list.push(resolveId);
        cache.set(resolveId, {
          to,
          css,
          scopedHash,
          resolveId
        });
      }
    }
    node.tag = false;
    delete node.content;
    return node;
  });
  tree.match(match('script[type="module"]'), (script) => {
    if (!mainjs && script.attrs && script.attrs.src) {
      if (/^(https?:)?\/\//.test(script.attrs.src)) {
        return script;
      }
      script.attrs.src = script.attrs.src + "?__posthtml_view__=0";
      mainjs = script.attrs.src;
    }
    return script;
  });
  function getMainjs() {
    if (mainjs)
      return mainjs;
    mainjs = options.slash(from, true).replace(".html", "." + jsExt) + "?__posthtml_view__=1";
    if (Array.isArray(tree)) {
      tree.push({
        tag: "script",
        attrs: {
          type: "module",
          src: mainjs
        }
      });
    }
    return mainjs;
  }
  const jsCache = new Map();
  const jsExtract = (obj) => {
    if (js && typeof js.extract === "function") {
      js.extract(obj);
    }
  };
  tree.match(match("script[data-resolve-id]"), (node) => {
    node.attrs = node.attrs || {};
    const resolveId = node.attrs["data-resolve-id"] || "";
    if (resolveId && !jsCache.has(resolveId)) {
      jsCache.set(resolveId, null);
      const src = node.attrs.src || "";
      const scopedHash = node.attrs["data-scoped-hash"] || "";
      const content = (src ? "" : toString$1(node.content)) || "";
      let ext = src && path.extname(src).replace(".", "") || jsExt;
      ext = ext === "ts" ? "ts" : "js";
      jsExtract({
        type: ext,
        from,
        resolveId,
        scopedHash,
        source: content,
        mainjs: getMainjs(),
        src: src.replace(`.${ext}`, "")
      });
    }
    node.tag = false;
    delete node.content;
    return node;
  });
  const invalidSelector = new Set();
  getPostcssConfigSync();
  extractList.forEach((resolveId) => {
    const css = extractCache.get(resolveId);
    if (!css)
      return;
    if (!css.css)
      return;
    if (isDev) {
      css.to = `#${attrIdKey}`;
      invalidSelector.add(css.to);
      tree.match(match(css.to), (node) => {
        invalidSelector.delete(css.to);
        const element = {
          tag: "style",
          attrs: {
            "data-to": "file",
            "data-scoped-hash": css.scopedHash,
            "data-resolve-id": css.resolveId
          },
          content: css.css
        };
        if (node.content) {
          node.content = [element, ...node.content];
        } else {
          node.content = [element];
        }
        return node;
      });
      return;
    }
    if (hasExtract) {
      promises.push(processor.process(css.css, { ...postcssrc_sync.options, from: from || void 0 }).then((result) => {
        styled.extract && styled.extract({
          type: "css",
          from,
          mainjs: getMainjs(),
          resolveId: css.resolveId,
          scopedHash: css.scopedHash,
          source: result.css
        });
      }));
    }
  });
  list.forEach((resolveId) => {
    const css = cache.get(resolveId);
    if (!css)
      return;
    if (!css.css)
      return;
    invalidSelector.add(css.to);
    tree.match(match(css.to), (node) => {
      invalidSelector.delete(css.to);
      switch (node.tag) {
        case "head":
          const styled2 = node.content && node.content.find((item) => {
            if (!item || typeof item === "string") {
              return false;
            }
            return item.tag === "style" && item.attrs && item.attrs[attrIdKey] === headStyleId;
          });
          if (styled2) {
            styled2.content = concatContent(styled2.content, css.css);
          } else {
            const element2 = {
              tag: "style",
              attrs: { [attrIdKey]: headStyleId },
              content: css.css
            };
            if (node.content) {
              node.content = concatContent(node.content, element2);
            } else {
              node.content = [element2];
            }
          }
          break;
        case "style":
          node.content = concatContent(node.content, css.css);
          break;
        default:
          const element = {
            tag: "style",
            attrs: {
              "data-scoped-hash": css.scopedHash,
              "data-resolve-id": css.resolveId
            },
            content: css.css
          };
          if (node.content) {
            node.content = concatContent(node.content, element);
          } else {
            node.content = [element];
          }
          break;
      }
      return node;
    });
  });
  const trimAttr = typeof options.trimAttr === "function" ? options.trimAttr : null;
  const _cumbersomeTrim = typeof options.cumbersomeTrim === "function" ? options.cumbersomeTrim : null;
  const trimContent = (attr, content) => {
    if (typeof content === "string" && content.trim()) {
      if (trimAttr) {
        return trimAttr(attr, content, trimAttrWhitespace);
      }
      if (attr === "application/ld+json" || alpineJsReg.test(attr)) {
        content = trimAttrWhitespace(content).trim();
        content = content.replace(/^{\s+/g, "{").replace(/\s+}$/g, "}");
        if (_cumbersomeTrim) {
          content = _cumbersomeTrim(attr, content);
        } else {
          const placeh = "[<?=@#$%!*&^@?>]";
          let matchs = [];
          let str = "";
          content.replace(/('|")(.*?)('|")/g, (match2, a, s, c) => {
            matchs.push(`${a}${s}${c}`);
            return placeh;
          }).replace(/\s+(&&|\|\||===?|!==?|<=|>=|\+=|-=)\s+/g, "$1").replace(/\s*\?\s*(.*?)\s*:\s*/g, "?$1:").replace(/(?<=[():\[\],\{\}"!'=])\s+/g, "").replace(/\s+(?=[():\[\],\{\}"!'=])/g, "").split(placeh).forEach((item, i) => {
            str = str + item + (matchs[i] || "");
          });
          content = str;
        }
      }
      return content;
    }
    return null;
  };
  tree.walk((node) => {
    if (node.tag && node.attrs) {
      Object.entries(node.attrs).forEach(([key, value]) => {
        if (["null", "undefined"].includes(value)) {
          delete node.attrs[key];
          return;
        }
        const val = trimContent(key, value || "");
        if (val) {
          node.attrs[key] = val;
        }
      });
      if (node.tag === "script" && node.attrs.type === "application/ld+json" && node.content) {
        const json = trimContent(node.attrs.type, [].concat(node.content).join(""));
        if (json)
          node.content = [json];
      }
      node.attrs.class = (node.attrs.class || "").trim();
      if (!node.attrs.class) {
        delete node.attrs.class;
      }
    }
    if (node.tag) {
      node.attrs = node.attrs || {};
      if (node.tag === "img") {
        node.attrs.alt = node.attrs.alt || "";
      }
      if (node.tag === "button") {
        node.attrs.type = node.attrs.type || "button";
      }
    }
    return node;
  });
  tree.match(match("style"), (style) => {
    const css = toString$1(style.content);
    if (css) {
      promises.push(processor.process(css, { ...postcssrc_sync.options, from: from || void 0 }).then((result) => {
        style.content = [result.css];
      }));
    }
    return style;
  });
  invalidSelector.forEach((value) => {
    throw Error("Invalid selector: " + value);
  });
  return await Promise.all(promises).then(() => {
    if (!isDev) {
      tree.match(match("head"), (head) => {
        const placeholder = {
          tag: "meta",
          attrs: {
            property: "posthtml:view-head-placeholder",
            content: "*"
          }
        };
        if (head.content) {
          head.content.push(placeholder);
        } else {
          head.content = [placeholder];
        }
        return head;
      });
    }
    return tree;
  });
}
function parseComponent(node, component, options, isPage) {
  return function(html) {
    if (typeof options.htmlProcessor === "function") {
      html = options.htmlProcessor(html);
    }
    return processWithPostHtml(options.parser, options.plugins, html, [
      parseStyleAndScript(node, component, options),
      parseAttrsToLocals(component, node.attrs, options)
    ]);
  };
}
function parseStyleAndScript(componentNode, component, options) {
  getPostcssConfigSync();
  const {
    stylePreprocessor,
    styled: optionStyled,
    addClassIncludes,
    assets,
    noflip,
    cssjanus
  } = options;
  const cssPreprocessor = (css) => {
    return Promise.resolve(stylePreprocessor(css));
  };
  return async function(tree) {
    const promises = [];
    let remove = false;
    let scopedHash = "";
    let scopedClasses = null;
    tree.match(match("style"), (style) => {
      const attrs = style.attrs || {};
      const styled = normalizeStyled(optionStyled, attrs);
      const content = toString$1(style.content);
      let src = attrs["src"];
      const dynamic = attrs["dynamic"] != null || isDynamicCss(content);
      if (src || content) {
        promises.push(Promise.resolve(null).then(() => {
          if (src) {
            src = options.join(component.src, src);
            return fse.readFile(src, options.encoding);
          }
          return Promise.resolve(content);
        }).then((css) => {
          if (!css)
            return { code: "" };
          css = noflip(css);
          return cssPreprocessor(css);
        }).then((result) => {
          const resultCss = result && result.code;
          return {
            ...result,
            code: cssjanus(resultCss || ""),
            to: dynamic && styled.to === "file" ? "head" : styled.to,
            type: styled.type
          };
        }));
      }
      if (remove) {
        style.tag = false;
        delete style.content;
      }
      remove = true;
      return style;
    });
    if (promises.length > 0) {
      const merges = await Promise.all(promises);
      promises.length = 0;
      const firstType = merges[0].type;
      let scoped_css = "";
      let global_css = "";
      let to = optionStyled.to;
      const start_mark = ":__posthtml_view_to_file_start_mark__{}";
      const end_mark = ":__posthtml_view_to_file_end_mark__{}";
      merges.forEach((item) => {
        if (item.to === "file" && item.code) {
          item.code = `${start_mark}${item.code}${end_mark}`;
        }
        if (item.type === "scoped") {
          scoped_css = scoped_css + (item.code || "");
        }
        if (item.type === "global") {
          global_css = global_css + (item.code || "");
        }
        if (item.to !== "file" && item.to !== optionStyled.to) {
          to = item.to;
        }
      });
      const ast = postcssScopedParser(scoped_css, component.resolveId, options, component.src, start_mark, end_mark, false);
      const globalAst = postcssScopedParser(global_css, component.resolveId, options, component.src, start_mark, end_mark, true);
      scoped_css = ast.css;
      scopedHash = ast.scopedHash;
      scopedClasses = ast.scopedClasses;
      global_css = globalAst.css;
      globalAst.scopedClasses.assetsCache.forEach((e) => {
        scopedClasses && scopedClasses.assetsCache.add(e);
      });
      globalAst.scopedClasses.assetsCache.clear();
      merges.length = 0;
      const replaceCss = (css) => {
        let fileCss = "";
        css = css.replace(/:__posthtml_view_to_file_start_mark__{}(.*?):__posthtml_view_to_file_end_mark__{}/gs, function(_, matchCss) {
          fileCss = fileCss + matchCss;
          return "";
        });
        return {
          css,
          fileCss
        };
      };
      const scoped_replace = replaceCss(scoped_css);
      const global_replace = replaceCss(global_css);
      scoped_css = scoped_replace.css;
      global_css = global_replace.css;
      let to_file_css = "";
      if (firstType === "global") {
        to_file_css = global_replace.fileCss + scoped_replace.fileCss;
      } else {
        to_file_css = scoped_replace.fileCss + global_replace.fileCss;
      }
      tree.match(match("style"), (style) => {
        if (firstType === "global") {
          style.content = [global_css + scoped_css];
        } else {
          style.content = [scoped_css + global_css];
        }
        scoped_css = "";
        global_css = "";
        style.attrs = style.attrs || {};
        style.attrs["data-to"] = to;
        style.attrs["data-scoped-hash"] = scopedHash;
        style.attrs["data-resolve-id"] = component.resolveId;
        delete style.attrs["scoped"];
        delete style.attrs["global"];
        delete style.attrs["src"];
        delete style.attrs["to"];
        delete style.attrs["dynamic"];
        return style;
      });
      if (to_file_css && Array.isArray(tree)) {
        tree.push({
          tag: "style",
          attrs: {
            "data-to": "file",
            "data-scoped-hash": scopedHash,
            "data-resolve-id": component.resolveId
          },
          content: to_file_css
        });
      }
    }
    const jsPrefix = options.prefix("js");
    tree.match(match("script"), (node) => {
      node.attrs = node.attrs || {};
      let src = node.attrs.src;
      if (src && /^(https?:)?\/\//.test(src)) {
        return node;
      }
      if (node.attrs[jsPrefix] === "null" || node.attrs[jsPrefix] === "false") {
        delete node.attrs[jsPrefix];
        return node;
      }
      if (src && node.attrs.type && node.attrs.type === "module") {
        node.attrs.src = options.join(component.src, src);
        node.attrs.src = options.slash(node.attrs.src, true);
        return node;
      }
      if (node.attrs.type && node.attrs[jsPrefix] == null) {
        return node;
      }
      if (src) {
        src = options.join(component.src, src);
        node.attrs.src = options.slash(src, true);
      }
      node.attrs["data-to"] = node.attrs.to;
      node.attrs["data-scoped-hash"] = scopedHash;
      node.attrs["data-resolve-id"] = component.resolveId;
      delete node.attrs.to;
      return node;
    });
    tree.walk((node) => {
      if (typeof node === "string")
        return node;
      node.attrs = node.attrs || {};
      const scopedCls = scopedClasses;
      if (scopedCls && scopedHash && node.tag) {
        const attrs = node.attrs;
        const classNames = attrs.class || "";
        const includes = (_attrs) => {
          if (addClassIncludes && addClassIncludes.length) {
            _attrs = {};
            addClassIncludes.forEach((attr) => {
              _attrs[attr] = attrs[attr];
            });
          }
          for (const key in _attrs) {
            if (Object.prototype.hasOwnProperty.call(_attrs, key)) {
              const values = _attrs[key] || "";
              if (scopedCls.classNames.some((c) => values.includes(c))) {
                return true;
              }
            }
          }
          return false;
        };
        if ((scopedCls.tags[node.tag] || includes(attrs)) && !classNames.includes(scopedHash)) {
          node.attrs.class = `${scopedHash} ${classNames}`.trim();
        }
      }
      if (node.attrs.style) {
        promises.push(processor.process(node.attrs.style, { ...postcssrc_sync.options, from: component.src || void 0 }).then((result) => {
          const s = ".__posthtml_view_inline_css_123456_abcdef__{";
          const ast = postcssScopedParser(`${s}${result.css}}`, component.resolveId, options, component.src, "", "", true);
          ast.scopedClasses.assetsCache.forEach((e) => {
            scopedClasses && scopedClasses.assetsCache.add(e);
          });
          ast.scopedClasses.assetsCache.clear();
          const css = ast.css.replace(s, "").replace("}", "");
          node.attrs && (node.attrs.style = cssjanus(css));
        }));
      }
      Object.keys(node.attrs).forEach((attrKey) => {
        if (!assets.attributes.includes(attrKey) && assets.attrRegExp.test(attrKey)) {
          assets.attributes.push(attrKey);
        }
      });
      const assets_include = typeof assets._include === "function" && assets._include;
      const assetsHandle = (rawUrl) => {
        if (!String(rawUrl).trim()) {
          return rawUrl;
        }
        if (assets_include && !assets_include(rawUrl)) {
          return rawUrl;
        }
        if (isExternalUrl(rawUrl) || isDataUrl(rawUrl) || rawUrl.startsWith("#") || dynamicTest(rawUrl)) {
          return rawUrl;
        }
        let url = options.join(component.src, rawUrl);
        url = options.slash(url, true);
        scopedClasses && scopedClasses.assetsCache.add(url);
        return url;
      };
      assets.attributes.forEach((attrKey) => {
        if (node.attrs[attrKey]) {
          const rawUrl = node.attrs[attrKey];
          let replace;
          const url = rawUrl.replace(/('|")(.*?)('|")/g, (match2, a, url2, c) => {
            replace = true;
            return `${a}${assetsHandle(url2)}${c}`;
          });
          node.attrs[attrKey] = !replace ? assetsHandle(rawUrl) : url;
        }
      });
      return node;
    });
    if (promises.length > 0) {
      await Promise.all(promises);
      promises.length = 0;
    }
    if (options.mode !== "development" && scopedClasses && scopedClasses.assetsCache.size) {
      const div = {
        tag: "div",
        attrs: {
          "__posthtml_view_assets_div__": true,
          "style": "display:none;"
        },
        content: []
      };
      scopedClasses.assetsCache.forEach((url) => {
        if (isFont(url)) {
          div.content.push({
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              href: url,
              "data-raw-url": url
            }
          });
        } else {
          div.content.push({
            tag: "img",
            attrs: {
              src: url,
              "data-raw-url": url
            }
          });
        }
      });
      if (div.content.length && Array.isArray(tree)) {
        tree.push(div);
      }
      scopedClasses.assetsCache.clear();
    }
    return tree;
  };
}
function normalizeStyled(styled, attrs) {
  styled = { ...styled };
  styled.to = attrs.to || styled.to || "head";
  let type = styled.type;
  if (attrs.scoped != null) {
    type = "scoped";
  } else if (attrs.global != null) {
    type = "global";
  }
  styled.type = type || "scoped";
  return styled;
}
function readComponentFile(component, encoding) {
  if (component.source != null) {
    return Promise.resolve(component.source || "");
  }
  return fse.readFile(component.src, encoding);
}
function getComponent(attrs, tag, components, options) {
  const queryPrefix = options.prefix("query");
  const view_query = attrs[queryPrefix] || "";
  if (view_query === "global") {
    return options.components[tag];
  }
  return components[tag] || options.components[tag];
}
function matchComponents(tree, {
  from: htmlFilePath,
  prefix,
  join,
  slash
}) {
  const components = {};
  tree.match(match(prefix("components")), (node) => {
    if (node.content) {
      node.content.forEach((element) => {
        if (typeof element === "string")
          return;
        let { src, ...locals } = element.attrs || {};
        if (element.tag && src) {
          src = join(htmlFilePath, src);
          components[element.tag] = {
            tag: element.tag,
            src,
            resolveId: slash(src),
            locals
          };
        }
      });
    }
    node.tag = false;
    delete node.content;
    return node;
  });
  tree.match(match(prefix("component")), (node) => {
    const attrs = node.attrs || {};
    let remove = false;
    if (attrs.src) {
      const tag = "view-src-" + getTag(attrs.src);
      const src = join(htmlFilePath, attrs.src);
      components[tag] = {
        tag,
        src,
        resolveId: slash(src),
        locals: {}
      };
      node.tag = tag;
      delete attrs.src;
    } else {
      remove = true;
    }
    if (remove) {
      node.tag = false;
      delete node.content;
    }
    return node;
  });
  return components;
}
function toString$1(css) {
  return [].concat(css || "").join("").trim();
}
function concatContent(...add) {
  return [].concat(...add).filter(Boolean);
}

function compilerViewPlugin(_options) {
  const options = { ..._options || {} };
  options.root = options.root || process.cwd();
  options.mode = options.mode || "development";
  options.encoding = options.encoding || "utf8";
  options.viewPrefix = options.viewPrefix || "view:";
  options.from = options.from || "";
  options.plugins = options.plugins || [];
  options.parser = options.parser || {};
  options.locals = options.locals || {};
  options.$attrs = options.$attrs || "$attrs";
  options.stylePreprocessor = options.stylePreprocessor || ((css) => ({ code: css }));
  options.js = {
    type: "ts",
    ...options.js
  };
  options.assets = {
    ...options.assets
  };
  options.assets.attributes = options.assets.attributes || ["data-src", "data-img"];
  options.assets.attrRegExp = options.assets.attrRegExp || alpineJsReg;
  options.styled = {
    type: "scoped",
    to: "head",
    prefix: "view-",
    ...options.styled
  };
  if (typeof options.getOptions === "function") {
    options.getOptions(options);
  }
  options.join = (from, src) => joinPath(options.root, options.from, from, src);
  options.slash = (src, sl) => slashPath(options.root, src, sl);
  options.prefix = (str) => `${options.viewPrefix}${str}`;
  options.rtl = options.rtl || false;
  options.cssjanus = (css) => {
    if (options.rtl && options.mode === "development") {
      return cssjanus(css, {
        transformEdgeInUrl: options.rtl.transformEdgeInUrl,
        transformDirInUrl: options.rtl.transformDirInUrl
      });
    }
    return css;
  };
  options.noflip = (css) => {
    if (options.rtl) {
      return noflipToPlaceholder(css);
    }
    return css;
  };
  return async function compilerTree(tree) {
    options.components = await parseGlobalComponents(options);
    const parsed = await parse(options)(tree);
    return await processWithPostHtml(options.parser, options.plugins, parsed);
  };
}

const cssReg = /\.(css|scss|less|sass|styl|stylus|pcss|postcss)$/;
function isCssRequest(id) {
  const bool = cssReg.test(id);
  cssReg.lastIndex = 0;
  return bool;
}
function getConfig(config, options) {
  config.build = config.build || {};
  config.build.rollupOptions = config.build.rollupOptions || {};
  config.build.ssr = false;
  const { input, pages } = getInputPages(config.root || process.cwd(), options);
  config.build.rollupOptions.input = input;
  config.server = config.server || {};
  if (config.server.open === true) {
    config.server.open = pages[0] && `/${pages[0].route || ""}` || "/";
  }
  return config;
}
function getHistoryReWriteRuleList(options) {
  const list = [];
  const pages = getPagesOptions(options);
  pages.forEach((item) => {
    const to = `./${item.path}`;
    if (item.pageName === "index") {
      list.push({
        from: /^\/$/,
        to
      });
    }
    list.push({
      from: new RegExp(`^/${item.route}/*`),
      to
    });
    list.push({
      from: new RegExp(`^/${item.route}$`),
      to
    });
  });
  return list;
}
function getInputPages(root, options) {
  const pages = getPagesOptions(options);
  const input = {};
  pages.forEach((item) => {
    input[item.pageName] = path.resolve(root, item.path);
  });
  return { input, pages };
}
function getPagesOptions({ pagesDirectory, includes, ignore }) {
  includes = includes.filter(Boolean).map((item) => item[0] === "/" ? item : "/" + item);
  return fg.sync(`${pagesDirectory}/**/*.html`.replace("//", "/"), {
    objectMode: true,
    ignore: ignore.map((item) => {
      return (item.includes(".") ? item : `**/${item}/**`).replace("//", "/");
    })
  }).filter((item) => {
    if (includes.some((f) => item.path.includes(f))) {
      return true;
    }
    return !item.path.includes("/_");
  }).map(({ name, path: path2 }) => {
    const obj = {
      filename: name,
      path: path2,
      route: "",
      pageName: ""
    };
    obj.route = path2.replace(`${pagesDirectory}/`, "");
    obj.pageName = obj.route.replace(/(\/index)?\.html/, "").replace("/", "-");
    return obj;
  });
}

const aesKey = "0123456789abcdef";
const markMap = {
  "=": "\\:",
  "php": "\\#",
  "\\:": "=",
  "\\#": "php"
};
const syntaxReg$1 = /\\{\\%(\\:|\\#)(.*?)\\%\\}/gs;
const phpReg$1 = /<\?(=|php)(.*?)\?>/gs;
const emptyReg = /(\\%\\})=""/g;
function htmlConversion(html) {
  return html.replace(syntaxReg$1, function(_match, p1, p2) {
    const p = markMap[p1] || p1;
    return `<?${p}${p2}?>`;
  });
}
function encryptHtml(html) {
  return html.replace(phpReg$1, function(_match, p1, p2) {
    const p = markMap[p1] || p1;
    return `\\{\\%${p}${aesEncrypt(p2, aesKey)}\\%\\}`;
  });
}
function decryptHtml(html) {
  return html.replace(emptyReg, "$1").replace(syntaxReg$1, function(_match, p1, p2) {
    return `\\{\\%${p1}${aesDecrypt(p2, aesKey)}\\%\\}`;
  });
}
function aesEncrypt(text, key) {
  const cipher = createCipheriv("aes128", key, key);
  let crypted = cipher.update(text, "utf8", "hex");
  crypted += cipher.final("hex");
  return crypted;
}
function aesDecrypt(text, key) {
  const cipher = createDecipheriv("aes128", key, key);
  let decrypted = cipher.update(text, "hex", "utf8");
  decrypted += cipher.final("utf8");
  return decrypted;
}

async function requireMock(jspath, originalUrl, hot = true) {
  let mock = null;
  if (shell.test("-f", jspath)) {
    try {
      let raw = null;
      const clean = (url) => {
        if (hot && require && require.cache && !!require.cache[url]) {
          delete require.cache[url];
        }
      };
      clean(jspath);
      raw = require(jspath);
      if (raw) {
        raw = raw.__esModule ? raw.default : raw;
        if (typeof raw === "function") {
          mock = raw(originalUrl);
        } else {
          mock = raw;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  return mock || {};
}
const htmlCache = new Map();
async function writeTemplate(html, root, cacheDirectory, file) {
  const filename = path.join(cacheDirectory, ".php-dev", file);
  if (htmlCache.get(file) !== html) {
    htmlCache.set(file, html);
    await fse.outputFile(path.resolve(root, filename), html, "utf8");
  }
  return {
    tplFileName: filename,
    __views: ""
  };
}

async function phpRenderToHtml(filename, args, input) {
  const { __views, ...rest } = input;
  const model = rest;
  model._TEMPLATE = filename;
  model._REGISTER_GLOBAL_MODEL = true;
  model._VIEWS_PATH = __views;
  const json = JSON.stringify(model, circular());
  const { stdout } = await execa("php", args && args.length ? args : [path.join(__dirname, "/loader.php")], {
    input: json
  });
  return stdout;
}

const defaultMinifyOptions$1 = {
  caseSensitive: true,
  collapseBooleanAttributes: true,
  collapseInlineTagWhitespace: true,
  collapseWhitespace: true,
  conservativeCollapse: false,
  html5: true,
  minifyCSS: true,
  minifyJS: true,
  minifyURLs: true,
  noNewlinesBeforeTagClose: true,
  removeAttributeQuotes: true,
  removeComments: true,
  removeEmptyAttributes: false,
  removeRedundantAttributes: false,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  removeTagWhitespace: false,
  useShortDoctype: true
};
let minifyOptions$1;
async function minifyHtml(html, options) {
  if (typeof options.minifyHtml === "function") {
    options.minifyHtml = options.minifyHtml(defaultMinifyOptions$1);
  }
  if (!options.minifyHtml) {
    return html;
  }
  minifyOptions$1 = minifyOptions$1 || (options.minifyHtml === true ? defaultMinifyOptions$1 : {
    ...defaultMinifyOptions$1,
    ...options.minifyHtml,
    removeTagWhitespace: false
  });
  html = await minify$1(html, minifyOptions$1);
  if (typeof options.minifyHtmlAfter === "function") {
    html = options.minifyHtmlAfter(html);
  } else {
    html = html.replace(/>(\s+)</g, "><");
  }
  return html;
}

function getMainjs(mainjs) {
  return mainjs.split("?__posthtml_view__=")[0];
}
const transformHandle = (config, options, virtualId, pageCache, chunkCache) => {
  function getPageFile(filename) {
    const p = path.resolve(config.root, options.pagesDirectory);
    return path.relative(p, filename);
  }
  const isDev = config.command === "serve";
  const noContent = `<div style="text-align:center;"><h1>posthtml-view</h1><p>No content</p></div>`;
  return async (html, ctx) => {
    const file = getPageFile(ctx.filename);
    if (options.php) {
      html = encryptHtml(html);
    }
    const processor = posthtml([
      compilerViewPlugin({
        ...options,
        from: ctx.filename,
        htmlProcessor(html2) {
          return encryptHtml(html2);
        },
        styled: {
          ...options.styled,
          extract: (meta) => {
            const mainjs = getMainjs(meta.mainjs);
            const css_src = `${virtualId}/${meta.resolveId.replace(".html", `.css`)}`;
            const import_css = `import '${css_src}';`;
            chunkCache.set(css_src, meta.source || "");
            const prev_source = pageCache.get(mainjs) || "";
            if (!prev_source.includes(css_src)) {
              pageCache.set(mainjs, prev_source + import_css);
            }
          }
        },
        js: {
          ...options.js,
          extract: (meta) => {
            const mainjs = getMainjs(meta.mainjs);
            if (meta.src) {
              const prev_source = pageCache.get(mainjs) || "";
              const import_js = `import '${meta.src}';`;
              if (!prev_source.includes(meta.src)) {
                pageCache.set(mainjs, prev_source + import_js);
              }
            } else {
              const js_src = `${virtualId}/${meta.resolveId.replace(".html", "")}`;
              const import_js = `import '${js_src}';`;
              chunkCache.set(js_src, meta.source || "");
              const prev_source = pageCache.get(mainjs) || "";
              if (!prev_source.includes(js_src)) {
                pageCache.set(mainjs, prev_source + import_js);
              }
            }
          }
        }
      }),
      ...options.plugins || []
    ]);
    if (typeof options.usePlugins === "function") {
      options.usePlugins(processor);
    }
    html = (await processor.process(html, {
      directives: [
        { name: "!DOCTYPE", start: "<", end: ">" },
        { name: "?php", start: "<", end: ">" },
        { name: "?=", start: "<", end: ">" }
      ],
      ...options.parser,
      sync: false
    })).html.trim();
    if (isDev) {
      if (options.php) {
        html = decryptHtml(html);
        if (options.devMinifyHtml) {
          html = await minifyHtml(html, options);
        }
        html = htmlConversion(html);
        if (typeof options.php.devRender === "function") {
          html = await options.php.devRender({
            html,
            options
          });
        } else {
          const mockPath = path.join(config.root, options.mocksDirectory, file.replace(".html", ".js"));
          if (typeof options.php.writeTemplateBefore === "function") {
            html = options.php.writeTemplateBefore(html) || html;
          }
          const [mock, { tplFileName, __views }] = await Promise.all([
            requireMock(mockPath, ctx.originalUrl || "", true),
            writeTemplate(html, config.root, options.cacheDirectory, file)
          ]);
          html = await phpRenderToHtml(tplFileName, options.php.args, {
            __views,
            ...mock
          });
        }
        return html || noContent;
      } else {
        if (options.devMinifyHtml) {
          html = await minifyHtml(html, options);
        }
      }
    }
    return html;
  };
};

let minify;
let classGenerator;
let idGenerator;
let jsonStorage;
const storage = {
  classesKey: "_classes",
  idsKey: "_ids",
  _classes: {},
  _ids: {},
  classes: {},
  ids: {}
};
const classes_map = {};
const ids_map = {};
function readCache(key, map) {
  try {
    const data = jsonStorage.getItem(key) || {};
    Object.keys(data).forEach((k) => {
      const v = data[k];
      map[v] = null;
    });
    return data;
  } catch (e) {
    return {};
  }
}
async function writeCache() {
  if (jsonStorage) {
    jsonStorage.setItem(storage.classesKey, storage.classes);
    jsonStorage.setItem(storage.idsKey, storage.ids);
  }
}
function createGenerator(_minify) {
  minify = minify || _minify;
  if (minify.__cache_file__ && !jsonStorage) {
    jsonStorage = new JSONStorage(minify.__cache_file__);
    storage._classes = readCache(storage.classesKey, classes_map);
    storage._ids = readCache(storage.idsKey, ids_map);
  }
  classGenerator = classGenerator || generateName(minify.generateNameFilters, minify.upperCase, (name) => classes_map[name] !== null);
  idGenerator = idGenerator || generateName(minify.generateNameFilters, minify.upperCase, (name) => ids_map[name] !== null);
}
function minifyClassesHandle(css) {
  const ast = postcssSafeParser(css);
  function walkNodes(nodes) {
    nodes.forEach((rule) => {
      if (rule.type === "atrule" && (rule.name === "media" || rule.name === "supports")) {
        walkNodes(rule.nodes);
      } else {
        switch (rule.type) {
          case "rule":
            rule.selector = selectorParser(rule.selector);
            break;
        }
      }
    });
  }
  walkNodes(ast.nodes);
  return ast.toString();
}
function selectorParser(selector) {
  return postcssSelectorParser((selectorRoot) => {
    selectorRoot.walkClasses((node) => {
      if (isFiltered(node.value, false, false)) {
        return;
      }
      let value = node.value;
      let hasDynamic = false;
      const values = value.replace(dynamicReg, (s) => {
        hasDynamic = true;
        return ` ${s} `;
      });
      if (hasDynamic) {
        value = values.split(/\s+/).map((val) => {
          if (!val)
            return "";
          if (isFiltered(val, false)) {
            return val;
          }
          const v = addClassesValues(val);
          return prefixValue(v) || val;
        }).filter(Boolean).join("").trim();
        value = withoutEscape(value);
        node.setPropertyWithoutEscape("value", value);
        return;
      }
      node.setPropertyWithoutEscape("value", prefixValue(addClassesValues(value)) || value);
    });
    selectorRoot.walkIds((node) => {
      if (isFiltered(node.value, true)) {
        return;
      }
      node.value = prefixValue(addIdValues(node.value)) || node.value;
    });
  }).processSync(selector);
}
function addClassesValues(value) {
  const cacheValue = storage._classes[value];
  if (cacheValue) {
    classes_map[cacheValue] = null;
    storage.classes[value] = cacheValue;
    delete storage._classes[value];
    return cacheValue;
  }
  const preValue = storage.classes[value];
  if (preValue) {
    classes_map[preValue] = null;
    return preValue;
  }
  const v = classGenerator.next().value;
  classes_map[v] = null;
  storage.classes[value] = v;
  return v;
}
function addIdValues(value) {
  const cacheValue = storage._ids[value];
  if (cacheValue) {
    ids_map[cacheValue] = null;
    storage.ids[value] = cacheValue;
    delete storage._ids[value];
    return cacheValue;
  }
  const preValue = storage.ids[value];
  if (preValue) {
    ids_map[preValue] = null;
    return preValue;
  }
  const v = idGenerator.next().value;
  ids_map[v] = null;
  storage.ids[value] = v;
  return v;
}
function isFiltered(value, id, check) {
  if (check !== false && isDynamicSelector(value)) {
    return true;
  }
  value = (id ? "#" : ".") + value;
  return minify.filters.some((reg) => {
    if (typeof reg === "string") {
      return reg === value;
    }
    return reg.test(value);
  });
}
function prefixValue(value) {
  if (!value)
    return value;
  return minify.prefix + value;
}
function htmlFor(id) {
  if (isFiltered(id, true)) {
    return;
  }
  const v = addIdValues(id);
  if (v) {
    return prefixValue(v);
  }
}
function useTagId(href) {
  href = href.slice(1);
  if (isFiltered(href, true)) {
    return;
  }
  const val = storage.ids[href];
  if (val) {
    return "#" + prefixValue(val);
  }
}
const phpReg = /\\?%\\?}(.*?)\\?{\\?%/gs;
const phpReg2 = /\s+(\\?{\\?%)/g;
function joinValues(values, id, filter) {
  if (!values)
    return values;
  if (!id) {
    values = values.replace(dynamicReg, (s) => ` ${s} `);
  }
  values = values.split(/\s+/).map((val) => {
    if (!val)
      return "";
    if (isFiltered(val, id)) {
      return val;
    }
    if (typeof filter === "function") {
      if (filter(val)) {
        return val;
      }
    }
    const v = !id ? addClassesValues(val) : addIdValues(val);
    return prefixValue(v) || val;
  }).filter(Boolean).join(" ").trim();
  if (!id) {
    values = values.replace(phpReg, (s, a) => {
      if (!a)
        return s;
      return s.replace(a, ` ${a.trim()} `);
    }).replace(phpReg2, "$1");
  }
  return values;
}

const rtlMark = "[[rtl]]";
const ltrMark = "[[ltr]]";
const defaultRtlOptions = {
  type: "syntax",
  syntax: `<?php if($rtl): ?>${rtlMark}<?php else: ?>${ltrMark}<?php endif; ?>`,
  devPreview: (originalUrl) => {
    if (originalUrl && (originalUrl.includes("rtl=1") || originalUrl.includes("lang=ar"))) {
      return true;
    }
    return false;
  }
};
const defaultMinifyOptions = {
  enableCache: true,
  generateNameFilters: [],
  upperCase: true,
  filters: [/^(\.|#)js-/],
  attributes: [],
  blurryAttrs: [],
  prefix: "",
  __cache_file__: ""
};
let minifyOptions;
function getRtlOptions(options) {
  return typeof options.rtl === "boolean" ? options.rtl ? defaultRtlOptions : false : {
    ...defaultRtlOptions,
    ...options.rtl
  };
}
const syntaxReg = /(.*)\[\[(rtl|ltr)\]\](.*)\[\[(rtl|ltr)\]\](.*)/si;
function posthtmlViewBundle(options, rtl) {
  const filter = createFilter(["**/*.html"]);
  let config;
  let preloadCss = options.preloadCss === false ? false : true;
  const { type, syntax } = rtl ? rtl : defaultRtlOptions;
  const janusCss = (css) => cssjanus(css, {
    transformDirInUrl: rtl && rtl.transformDirInUrl || false,
    transformEdgeInUrl: rtl && rtl.transformEdgeInUrl || false
  });
  const correctSyntax = () => {
    return syntax && (syntax.includes(rtlMark) || syntax.includes(ltrMark));
  };
  let syntaxArr = null;
  if (rtl && type === "syntax" && correctSyntax()) {
    const sm = syntax.match(syntaxReg);
    if (sm && sm.length >= 6) {
      syntaxArr = sm.slice(1).map((item) => item.trim()).filter(Boolean);
    }
  }
  const bools = [
    "crossorigin",
    "nomodule",
    "defer",
    "async",
    "hidden",
    "x-transition",
    "x-ignore",
    "x-cloak",
    "x-collapse",
    ...options.boolAttrs || []
  ];
  const assetsCss = [];
  const assetsJs = [];
  function boolsAttrsHandle(tree) {
    tree.walk((node) => {
      if (node.attrs) {
        const attrs = Object.keys(node.attrs);
        attrs.forEach((attrKey) => {
          if (node.attrs[attrKey] === "" && bools.some((item) => item.indexOf(attrKey) === 0)) {
            node.attrs[attrKey] = true;
          }
        });
      }
      return node;
    });
  }
  const normalizeHtml = async (source) => {
    return (await posthtml([]).use((tree) => {
      tree.match(match("head"), (head) => {
        const links = [];
        tree.match.call(head, match('link[rel="preload"][as="style"][href]'), (link) => {
          link.tag = false;
          return link;
        });
        tree.match.call(head, match('link[rel="stylesheet"][href]'), (link) => {
          const attrs = link.attrs || {};
          if (link.tag && attrs.href && assetsCss.some((href) => attrs.href && attrs.href.includes(href))) {
            if (preloadCss) {
              links.push({
                tag: "link",
                attrs: {
                  ...attrs,
                  rel: "preload",
                  as: "style",
                  href: attrs.href
                }
              });
            }
            links.push({
              tag: "link",
              attrs
            });
            link.tag = false;
          }
          return link;
        });
        tree.match.call(head, match('script[type="module"][src],link[rel="modulepreload"][href]'), (node) => {
          const attrs = node.attrs || {};
          const href = attrs.href || attrs.src;
          if (node.tag && href && assetsJs.some((js) => href.includes(js))) {
            links.push({
              tag: node.tag,
              attrs
            });
            node.tag = false;
          }
          return node;
        });
        const images = [];
        tree.match.call(head, match('link[rel="preload"][as="image"][href]'), (link) => {
          const attrs = link.attrs || {};
          if (link.tag && attrs.href) {
            images.push({
              tag: "link",
              attrs
            });
            link.tag = false;
          }
          return link;
        });
        const css = [];
        tree.match.call(head, match("style[__posthtml_view_css__]"), (style) => {
          const content2 = toString(style.content);
          if (style.tag && content2 && !css.includes(content2)) {
            css.push(content2);
          }
          style.tag = false;
          delete style.content;
          return style;
        });
        const content = css.map((item) => ({
          tag: "style",
          content: item
        }));
        tree.match.call(head, match('meta[property="posthtml:view-head-placeholder"]'), (placeh) => {
          placeh.content = [...links, ...images, ...content];
          placeh.tag = false;
          return placeh;
        });
        return head;
      });
      if (minifyOptions) {
        tree.match(match("style"), (style) => {
          if (style.attrs && style.attrs["data-min-class-ignore"] != null) {
            delete style.attrs["data-min-class-ignore"];
            return style;
          }
          const content = toString(style.content);
          if (content) {
            style.content = [minifyClassesHandle(content)];
          }
          return style;
        });
      }
      return tree;
    }).use((tree) => {
      const assets = new Map();
      const replaceAssets = (str) => {
        if (str && assets.size) {
          assets.forEach((assetsUrl, rawUrl) => {
            str = replaceAll(str, rawUrl, assetsUrl);
          });
        }
        return str;
      };
      tree.match(match("div[__posthtml_view_assets_div__]"), (div) => {
        tree.match.call(div, match("[data-raw-url]"), (node) => {
          if (node.attrs && node.attrs["data-raw-url"]) {
            assets.set(node.attrs["data-raw-url"], node.attrs.href || node.attrs.src || "");
          }
          node.tag = false;
          return node;
        });
        div.tag = false;
        delete div.content;
        return div;
      });
      const assetsAttrs = options.assets.attributes;
      const attrRegExp = options.assets.attrRegExp;
      tree.walk((node) => {
        if (typeof node === "string")
          return node;
        if (node.attrs) {
          const attrs = Object.keys(node.attrs);
          attrs.forEach((attrKey) => {
            if (!assetsAttrs.includes(attrKey) && attrRegExp.test(attrKey)) {
              assetsAttrs.push(attrKey);
            }
          });
          assetsAttrs && assetsAttrs.forEach((attrKey) => {
            if (node.attrs[attrKey]) {
              node.attrs[attrKey] = replaceAssets(node.attrs[attrKey]);
            }
          });
          if (node.attrs.style) {
            node.attrs.style = replaceAssets(node.attrs.style);
          }
          const buildClass = (node.attrs["view-build-class"] || "").split(" ").filter(Boolean);
          delete node.attrs["view-build-class"];
          if (minifyOptions) {
            const attributes = [
              ...minifyOptions.attributes,
              /^[xv]-transition/
            ];
            const blurryAttrs = [
              ...minifyOptions.blurryAttrs,
              /^([xv]-bind)?:class/
            ];
            const asReplace = (arr, attr) => arr.some((item) => {
              if (typeof item === "string")
                return item === attr;
              return item.test && item.test(attr);
            });
            const skip = (val) => {
              if (config.assetsInclude(val)) {
                return true;
              }
              if (buildClass.length) {
                return !buildClass.includes(val);
              }
              return false;
            };
            attrs.forEach((attr) => {
              if (attr === "id" || attr === "class")
                return;
              if (typeof node.attrs[attr] !== "string") {
                return;
              }
              if (typeof node.attrs[attr] === "string" && !node.attrs[attr].trim()) {
                return;
              }
              if (asReplace(attributes, attr)) {
                node.attrs[attr] = joinValues(node.attrs[attr], false, skip);
              } else if (asReplace(blurryAttrs, attr)) {
                const rawValue = node.attrs[attr] || "";
                let replace;
                const value = rawValue.replace(/('|")(.*?)('|")/g, (match2, a, val, c) => {
                  replace = true;
                  return `${a}${joinValues(val, false, skip)}${c}`;
                });
                node.attrs[attr] = replace ? value : rawValue;
              } else if (buildClass.length) {
                buildClass.forEach((item) => {
                  if (node.attrs[attr].includes(item)) {
                    const a = joinValues(item);
                    node.attrs[attr] = replaceAll(node.attrs[attr], item, a);
                  }
                });
              }
            });
            if (node.attrs.class) {
              node.attrs.class = joinValues(node.attrs.class);
            }
            if (node.attrs.id) {
              node.attrs.id = joinValues(node.attrs.id, true);
            }
            if (node.attrs["for"]) {
              const forId = htmlFor(node.attrs["for"]);
              if (forId) {
                node.attrs["for"] = forId;
              }
            }
            const urls = ["mask", "fill", "filter"];
            urls.forEach((item) => {
              if (node.attrs[item]) {
                const tagId = useTagId(node.attrs[item].replace(/url\((.*?)\)/g, "$1"));
                if (tagId) {
                  node.attrs[item] = `url(${tagId})`;
                }
              }
            });
            if (node.tag === "use" && (node.attrs.href || node.attrs["xlink:href"])) {
              const useAttr = node.attrs.href ? "href" : "xlink:href";
              const tagId = useTagId(node.attrs[useAttr] || "");
              if (tagId) {
                node.attrs[useAttr] = tagId;
              }
            }
          }
        }
        return node;
      });
      const syntaxStyleTag = "posthtml-view-syntax-style-x";
      tree.match(match("style"), (style) => {
        let content = replaceAssets([].concat(style.content || "").join("").trim());
        let ltrContent = content && placeholderToNoflip(content, "");
        if (ltrContent && syntaxArr && syntaxArr.length) {
          const rtlContent = janusCss(content);
          if (rtlContent !== ltrContent) {
            style.content = syntaxArr.map((item) => {
              if (item === "rtl") {
                return {
                  tag: syntaxStyleTag,
                  attrs: style.attrs,
                  content: rtlContent
                };
              }
              if (item === "ltr") {
                return {
                  tag: syntaxStyleTag,
                  attrs: style.attrs,
                  content: ltrContent
                };
              }
              return item;
            });
            style.tag = false;
            style.attrs = void 0;
            return style;
          }
        }
        if (ltrContent) {
          style.content = [ltrContent];
        }
        return style;
      });
      if (syntaxArr && syntaxArr.length) {
        tree.match(match("link[href]"), (link) => {
          const href = link.attrs && link.attrs.href;
          if (link.attrs && href && href.endsWith(".css") && syntaxArr) {
            const rtlHref = href.replace(".css", ".rtl.css");
            link.attrs.href = syntaxArr.map((item) => {
              if (item === "rtl") {
                return rtlHref;
              }
              if (item === "ltr") {
                return href;
              }
              return item;
            }).join("");
          }
          return link;
        });
        tree.match(match("html"), (node) => {
          if (syntaxArr) {
            node.attrs = node.attrs || {};
            node.attrs.dir = syntaxArr.map((item) => {
              if (item === "rtl") {
                return "rtl";
              }
              if (item === "ltr") {
                return "ltr";
              }
              return item;
            }).join("");
          }
          return node;
        });
      } else {
        tree.match(match("html"), (node) => {
          node.attrs = node.attrs || {};
          node.attrs.dir = "ltr";
          return node;
        });
      }
      return Promise.resolve().then(() => {
        tree.match(match(syntaxStyleTag), (node) => {
          node.tag = "style";
          return node;
        });
        return tree;
      });
    }).use((tree) => {
      return Promise.resolve().then(() => {
        let _tree;
        if (typeof options.generateUsePlugins === "function") {
          _tree = options.generateUsePlugins(tree);
        }
        return boolsAttrsHandle(_tree || tree);
      });
    }).process(source, {})).html;
  };
  return {
    name: "view:posthtml-view-bundle",
    enforce: "post",
    apply: "build",
    configResolved(_config) {
      config = _config;
    },
    async generateBundle(gb, bundles) {
      const minifyClassnames = options.minifyClassnames;
      if (minifyClassnames && !minifyOptions) {
        minifyOptions = minifyClassnames === true ? defaultMinifyOptions : { ...defaultMinifyOptions, ...minifyClassnames };
        minifyOptions.prefix = minifyOptions.prefix && toValidCSSIdentifier(minifyOptions.prefix);
        minifyOptions.filters = [...minifyOptions.filters, "#vite-legacy-polyfill", "#vite-legacy-entry"];
        if (minifyOptions.enableCache) {
          minifyOptions.__cache_file__ = path.join(config.root, path.join(options.cacheDirectory, "css"));
        } else {
          minifyOptions.__cache_file__ = "";
        }
        createGenerator(minifyOptions);
      }
      const bundleValues = Object.values(bundles);
      for (const bundle of bundleValues) {
        if (bundle.fileName.endsWith(".js")) {
          !assetsJs.includes(bundle.fileName) && assetsJs.push(bundle.fileName);
        }
        if (bundle.type === "asset" && bundle.fileName.endsWith(".css")) {
          !assetsCss.includes(bundle.fileName) && assetsCss.push(bundle.fileName);
          let source = stringSource(bundle.source);
          if (minifyOptions) {
            source = minifyClassesHandle(source);
          }
          bundle.source = placeholderToNoflip(source, "");
          if (rtl) {
            this.emitFile({
              type: "asset",
              fileName: bundle.fileName.replace(".css", ".rtl.css"),
              name: bundle.name ? bundle.name.replace(".css", ".rtl.css") : void 0,
              source: janusCss(source)
            });
          }
        }
      }
      for (const bundle of bundleValues) {
        if (bundle.type === "asset" && filter(bundle.fileName)) {
          let source = stringSource(bundle.source);
          source = await normalizeHtml(source);
          if (options.php) {
            source = decryptHtml(source);
          }
          source = await minifyHtml(source, options);
          if (options.php) {
            source = htmlConversion(source);
          }
          bundle.source = source;
          const { fileName, name } = renameHandle(bundle.fileName, bundle.name, options);
          bundle.fileName = fileName;
          bundle.name = name;
          if (rtl && type === "new-html") {
            let html = (await posthtml([]).use((tree) => {
              tree.match(match("html"), (node) => {
                node.attrs = node.attrs || {};
                node.attrs.dir = "rtl";
                return node;
              });
              tree.match(match("link[href]"), (link) => {
                if (link.attrs && link.attrs.href && link.attrs.href.endsWith(".css")) {
                  link.attrs.href = link.attrs.href.replace(".css", ".rtl.css");
                }
                return link;
              });
              tree.match(match("style"), (style) => {
                const content = [].concat(style.content || "").join("").trim();
                if (content) {
                  style.content = [janusCss(content)];
                }
                return style;
              });
              return boolsAttrsHandle(tree);
            }).process(source, {})).html;
            if (html) {
              html = await minifyHtml(html, options);
              this.emitFile({
                type: "asset",
                fileName: fileName.replace(/\.(html?|php)/g, ".rtl.$1"),
                name: name ? name.replace(/\.(html?|php)/g, ".rtl.$1") : void 0,
                source: html
              });
            }
          }
        }
        if (bundle.type === "chunk" && bundle.fileName.includes("-legacy") && typeof options.removeCssInJs === "function") {
          const code = options.removeCssInJs(stringSource(bundle.code));
          bundle.code = code || bundle.code;
        }
      }
      await writeCache();
    }
  };
}
function renameHandle(fileName, name, options) {
  const {
    buildPagesDirectory,
    pagesDirectory,
    php
  } = options;
  if (buildPagesDirectory !== pagesDirectory) {
    const i = fileName.indexOf(pagesDirectory);
    if (i >= 0) {
      fileName = buildPagesDirectory + fileName.slice(i + pagesDirectory.length);
    }
  }
  if (php && php.rename) {
    fileName = fileName.replace(/\.(html?)/g, ".php");
    if (name) {
      name = name.replace(/\.(html?)/g, ".php");
    }
  }
  return {
    fileName,
    name
  };
}
function stringSource(source) {
  if (source instanceof Uint8Array) {
    return Buffer.from(source).toString("utf-8");
  }
  return source;
}
function replaceAll(str, searchValue, replaceValue) {
  while (str.includes(searchValue)) {
    str = str.replace(searchValue, replaceValue);
  }
  return str;
}
function toString(...css) {
  return [].concat(...css).filter(Boolean).join("").trim();
}

function vitePluginPosthtmlView(_opts) {
  const options = merge({
    includes: [],
    ignore: [],
    pagesDirectory: "pages",
    mocksDirectory: "mocks",
    buildPagesDirectory: "pages",
    cacheDirectory: ".posthtml-view-cache",
    usePlugins: null,
    rtl: false,
    minifyHtml: true,
    devMinifyHtml: false,
    minifyClassnames: false,
    preloadCss: true
  }, _opts || {});
  options.pagesDirectory = options.pagesDirectory || "pages";
  options.buildPagesDirectory = options.buildPagesDirectory || options.pagesDirectory;
  options.cacheDirectory = options.cacheDirectory || ".posthtml-view-cache";
  options.getOptions = (opts) => {
    options.styled = opts.styled;
    options.assets = opts.assets;
  };
  const pageCache = new Map();
  const chunkCache = new Map();
  const virtualId = "virtual:posthtml-view";
  const rtl = getRtlOptions(options);
  const posthtmlViewPages = () => {
    const name = "view:posthtml-view-pages";
    let config;
    return {
      name,
      enforce: "pre",
      config(conf, { mode }) {
        getConfig(conf, options);
      },
      configResolved(_config) {
        config = _config;
        options.root = config.root;
        options.assets = options.assets || {};
        options.assets._include = config.assetsInclude;
        options.mode = config.command === "build" ? "production" : "development";
      },
      transformIndexHtml: {
        enforce: "pre",
        async transform(html, ctx) {
          if (config.command === "serve") {
            if (rtl && typeof rtl.devPreview === "function" && rtl.devPreview(ctx.originalUrl)) {
              options.rtl = rtl;
            } else {
              options.rtl = false;
            }
          } else {
            options.rtl = rtl;
          }
          return await transformHandle(config, options, virtualId, pageCache, chunkCache)(html, ctx);
        }
      },
      async resolveId(id, importer) {
        if (id === virtualId) {
          return id;
        }
        if (/\?__posthtml_view__=(0|1)/g.test(id)) {
          return id;
        }
        if (id.startsWith(virtualId)) {
          return id;
        }
        return null;
      },
      async load(id) {
        if (id === virtualId) {
          return "";
        }
        if (/\?__posthtml_view__=(0|1)/g.test(id)) {
          const mainid = getMainjs(id);
          const injectMain = id.includes("__posthtml_view__=1");
          let code = "";
          if (!injectMain) {
            code = code + `import '${mainid.replace(/\.(t|j)s/g, "")}';`;
          }
          code = code + (pageCache.get(mainid) || "");
          return code;
        }
        if (id.startsWith(virtualId)) {
          return chunkCache.get(id) || "";
        }
        return null;
      },
      async transform(code, id) {
        if (config.command === "build" && rtl && isCssRequest(id)) {
          return noflipToPlaceholder(code);
        }
        return null;
      }
    };
  };
  const posthtmlViewDev = () => {
    return {
      name: "view:posthtml-view-dev",
      enforce: "pre",
      apply: "serve",
      configureServer(server) {
        const middlewares = server.middlewares;
        middlewares.use(history({
          verbose: Boolean(({}).DEBUG) && ({}).DEBUG !== "false",
          disableDotRule: void 0,
          htmlAcceptHeaders: ["text/html", "application/xhtml+xml"],
          rewrites: getHistoryReWriteRuleList(options)
        }));
      },
      async transform(code, id) {
        if (rtl && options.rtl && isCssRequest(id)) {
          return cssjanus(code, {
            transformDirInUrl: rtl.transformDirInUrl || false,
            transformEdgeInUrl: rtl.transformEdgeInUrl || false
          });
        }
        return null;
      },
      async handleHotUpdate({ file, server }) {
        if (file.includes("/" + options.mocksDirectory) || file.includes(".html")) {
          server.ws.send({
            type: "full-reload",
            path: "*"
          });
        }
        return [];
      }
    };
  };
  return [
    posthtmlViewDev(),
    posthtmlViewPages(),
    posthtmlViewBundle(options, rtl)
  ];
}

export { compilerViewPlugin, generateName, slugify, toValidCSSIdentifier, vitePluginPosthtmlView };
