import path from 'path'
import fse from 'fs-extra'
import postcss, { Result } from 'postcss'
import type Processor from 'postcss/lib/processor'
import postcssrc, { Result as PostcssrcResult } from 'postcss-load-config'
import { Node as Tree, RawNode } from 'posthtml'
import match from 'posthtml-match-helper'

import type {
  ComponentMeta,
  StyleType,
  StyledOptions,
  StyleToSelector,
  ExtractHandle
} from '../types'
import { isExternalUrl, isDataUrl } from '../utils'

import {
  OptionsUtils,
  htmlElements,
  svgElements,
  getTag,
  isDynamicCss,
  dynamicTest,
  isFont,
  trimAttrWhitespace,
  alpineJsReg
} from './utils'

import { processWithPostHtml, parseAttrsToLocals, parseTemplate } from './parser'
import { ScopedClasses, postcssScopedParser } from './css'

type Components = OptionsUtils['components']

interface StyleAttrs extends Record<Partial<StyleType>, string | boolean> {
  to: StyleToSelector
}

let postcssrc_sync: PostcssrcResult
let processor: Processor

const getPostcssConfigSync = () => {
  try {
    postcssrc_sync = postcssrc_sync || postcssrc.sync()

  } catch (e) {
    postcssrc_sync = {
      file: '',
      options: {},
      plugins: []
    }
  }

  processor = processor || postcss(postcssrc_sync.plugins)
}

export function parse(options: OptionsUtils) {
  function parseHandle(options: OptionsUtils, isPage: boolean) {
    return async function (tree: Tree) {
      const promises: Promise<any>[] = []

      const components = matchComponents(tree, options)

      tree.walk((node) => {
        if (typeof node === 'string') {
          // @TODO remove whitespace
          return node
        }

        if (!node.tag) return node

        const attrs = node.attrs || {}
        const component = getComponent(attrs, node.tag, components, options)

        if (component) {
          if (htmlElements.includes(component.tag)) {
            throw new Error(`The component <${component.tag}> is the HTML tag. page file: ${options.from}`)

          } else if (svgElements.includes(component.tag)) {
            throw new Error(`The component <${component.tag}> is the SVG tag. page file: ${options.from}`)
          }

          if (node.attrs) {
            delete node.attrs[options.prefix('query')]
          }

          promises.push(
            readComponentFile(component, options.encoding)
              .then(parseComponent(node, component, options, isPage))
              .then((tree) => {
                const _options = {
                  ...options,
                  from: component.src
                }

                return parseHandle(_options, false)(tree)
              })
              // parse slot
              .then(parseTemplate(node, component, options))
          )
        }

        return node
      })

      if (isPage) {
        const resolveId = options.slash(options.from)

        promises.push(
          parseStyleAndScript(null, {
            tag: resolveId.replace(/\/|\./g, '-'),
            src: options.from,
            resolveId: resolveId,
            locals: {}
          }, options)(tree)
        )
      }

      if (promises.length > 0) {
        await Promise.all(promises)
        promises.length = 0
      }

      // Collect the CSS
      if (isPage) {
        return await collectCssAndJs(tree, options)
      }

      return tree
    }
  }

  return parseHandle(options, true)
}

interface CssCache {
  to: StyleToSelector
  css: string
  scopedHash: string
  resolveId: ResolveId
}

type ResolveId = string

async function collectCssAndJs(tree: Tree, options: OptionsUtils) {
  const { styled, js, from, mode, rtl } = options
  const isDev = mode === 'development'
  const headStyleId = '@'
  const attrIdKey = '__posthtml_view_css__'

  let mainjs = ''

  const promises: Promise<void | Result>[] = []

  if (isDev) {
    tree.match(match('body'), (node) => {
      const css_container: any = {
        tag: 'div',
        attrs: {
          id: attrIdKey,
          'data-id': 'development_css_container',
          style: 'display: none !important;'
        }
      }

      node.content = [css_container, ...(node.content || [])]

      return node
    })

    tree.match(match('html'), (node) => {
      node.attrs = node.attrs || {}

      node.attrs.dir = rtl ? 'rtl' : 'ltr'

      return node
    })
  }

  const cache = new Map<ResolveId, CssCache>()
  const list: ResolveId[] = []

  const extractCache = new Map<ResolveId, CssCache>()
  const extractList: ResolveId[] = []
  const hasExtract = typeof styled.extract === 'function'
  const jsExt = js.type === 'ts' ? 'ts' : 'js'

  tree.match(match('style'), function (node) {
    const css = toString(node.content)

    node.attrs = (node.attrs || {})

    const scopedHash = node.attrs['data-scoped-hash'] || ''
    const resolveId = node.attrs['data-resolve-id'] || ''

    let to = node.attrs['data-to'] || styled.to || 'head'

    if (isDev && to !== '*') {
      to = `#${attrIdKey}`
    }

    if ((node.attrs['data-to'] === 'file' || to === 'file') && hasExtract) {
      if (css && !extractCache.has(resolveId)) {
        extractCache.set(resolveId, {} as any)

        !extractList.includes(resolveId) && extractList.push(resolveId)

        extractCache.set(resolveId, {
          to: 'file',
          css,
          scopedHash,
          resolveId
        })
      }

    } else {
      if (css && !cache.has(resolveId)) {
        cache.set(resolveId, {} as any)

        // 不做处理, 就在在当前位置
        if (to === '*') {
          if (!isDev) {
            delete node.attrs['data-to']
            delete node.attrs['data-scoped-hash']
            delete node.attrs['data-resolve-id']
          }

          return node
        }

        !list.includes(resolveId) && list.push(resolveId)

        cache.set(resolveId, {
          to: (to as any),
          css,
          scopedHash,
          resolveId
        })
      }
    }

    node.tag = false as any
    delete node.content

    return node
  })

  // has module
  tree.match(match('script[type="module"]'), (script) => {
    if (!mainjs && script.attrs && script.attrs.src) {

      if (/^(https?:)?\/\//.test(script.attrs.src)) {
        return script
      }

      script.attrs.src = script.attrs.src + '?__posthtml_view__=0'
      mainjs = script.attrs.src
    }

    return script
  })

  function getMainjs() {
    if (mainjs) return mainjs

    mainjs = options.slash(from, true).replace('.html', '.' + jsExt) + '?__posthtml_view__=1'

    if (Array.isArray(tree)) {
      tree.push({
        tag: 'script',
        attrs: {
          type: 'module',
          src: mainjs
        }
      })
    }

    return mainjs
  }

  const jsCache = new Map<string, null>()

  const jsExtract: ExtractHandle = (obj) => {
    if (js && typeof js.extract === 'function') {
      js.extract(obj)
    }
  }

  tree.match(match('script[data-resolve-id]'), (node) => {
    node.attrs = (node.attrs || {})

    const resolveId = node.attrs['data-resolve-id'] || ''

    if (resolveId && !jsCache.has(resolveId)) {
      jsCache.set(resolveId, null)

      const src = node.attrs.src || ''
      const scopedHash = node.attrs['data-scoped-hash'] || ''
      const content = (src ? '' : toString(node.content)) || ''

      let ext = (src && path.extname(src).replace('.', '')) || jsExt
      ext = ext === 'ts' ? 'ts' : 'js'

      jsExtract({
        type: ext,
        from,
        resolveId,
        scopedHash,
        source: content,
        mainjs: getMainjs(),
        src: src.replace(`.${ext}`, '')
      })
    }

    node.tag = false as any
    delete node.content

    return node
  })

  const invalidSelector = new Set<string>()

  // postcss
  getPostcssConfigSync()

  extractList.forEach((resolveId) => {
    const css = extractCache.get(resolveId)

    if (!css) return
    if (!css.css) return

    if (isDev) {
      css.to = `#${attrIdKey}` as any

      invalidSelector.add(css.to)

      tree.match(match(css.to), (node) => {
        invalidSelector.delete(css.to)

        const element: any = {
          tag: 'style',
          attrs: {
            'data-to': 'file',
            'data-scoped-hash': css.scopedHash,
            'data-resolve-id': css.resolveId,
          },
          content: css.css
        }

        if (node.content) {
          node.content = [element, ...node.content]

        } else {
          node.content = [element]
        }

        return node
      })

      return
    }

    if (hasExtract) {
      promises.push(
        processor
          .process(css.css, { ...postcssrc_sync.options, from: from || undefined })
          .then(result => {
            styled.extract && styled.extract({
              type: 'css',
              from,
              mainjs: getMainjs(),
              resolveId: css.resolveId,
              scopedHash: css.scopedHash,
              source: result.css
            })
          })
      )
    }
  })

  list.forEach((resolveId) => {
    const css = cache.get(resolveId)

    if (!css) return
    if (!css.css) return

    invalidSelector.add(css.to)

    tree.match(match(css.to), (node) => {
      invalidSelector.delete(css.to)

      switch (node.tag) {
        case 'head':
          const styled: any = node.content && node.content.find(item => {
            if (!item || typeof item === 'string') {
              return false
            }

            return item.tag === 'style' && item.attrs && item.attrs[attrIdKey] === headStyleId
          })

          if (styled) {
            styled.content = concatContent(styled.content, css.css)

          } else {
            const element: any = {
              tag: 'style',
              attrs: { [attrIdKey]: headStyleId },
              content: css.css
            }

            if (node.content) {
              node.content = concatContent(node.content, element)

            } else {
              node.content = [element]
            }
          }
          break;

        case 'style':
          node.content = concatContent(node.content, css.css)
          break;

        default:
          const element: any = {
            tag: 'style',
            attrs: {
              'data-scoped-hash': css.scopedHash,
              'data-resolve-id': css.resolveId,
            },
            content: css.css
          }

          if (node.content) {
            node.content = concatContent(node.content, element)

          } else {
            node.content = [element]
          }
          break;
      }

      return node
    })
  })

  const trimAttr = typeof options.trimAttr === 'function'
    ? options.trimAttr
    : null

  const _cumbersomeTrim = typeof options.cumbersomeTrim === 'function'
    ? options.cumbersomeTrim
    : null

  const trimContent = (attr: string, content: string) => {
    if (typeof content === 'string' && content.trim()) {
      if (trimAttr) {
        return trimAttr(attr, content, trimAttrWhitespace)
      }

      if (attr === 'application/ld+json' || alpineJsReg.test(attr)) {
        content = trimAttrWhitespace(content).trim()

        content = content
          .replace(/^{\s+/g, '{')
          .replace(/\s+}$/g, '}')

        if (_cumbersomeTrim) {
          content = _cumbersomeTrim(attr, content)

        } else {
          const placeh = '[<?=@#$%!*&^@?>]'
          let matchs: string[] = []

          // .replace(/\s+(&&|\|\|)\s+/g, '$1')

          let str = ''

          content
            .replace(/('|")(.*?)('|")/g, (match, a, s, c) => {
              matchs.push(`${a}${s}${c}`)
              return placeh

            })
            .replace(/\s+(&&|\|\||===?|!==?|<=|>=|\+=|-=)\s+/g, '$1')
            .replace(/\s*\?\s*(.*?)\s*:\s*/g, '?$1:')
            .replace(/(?<=[():\[\],\{\}"!'=])\s+/g, '')
            .replace(/\s+(?=[():\[\],\{\}"!'=])/g, '')
            .split(placeh)
            .forEach((item, i) => {
              str = str + item + (matchs[i] || '')
            })

          content = str
        }
      }

      return content
    }

    return null
  }

  tree.walk((node) => {
    if (node.tag && node.attrs) {
      Object.entries(node.attrs).forEach(([key, value]) => {
        if (['null', 'undefined'].includes(value as string)) {
          delete node.attrs[key]
          return
        }

        const val = trimContent(key, value || '')

        if (val) {
          node.attrs[key] = val
        }
      })

      if (
        node.tag === 'script' &&
        node.attrs.type === 'application/ld+json' &&
        node.content
      ) {
        const json = trimContent(node.attrs.type, [].concat(node.content as []).join(''))

        if (json) node.content = [json]
      }

      node.attrs.class = (node.attrs.class || '').trim()

      if (!node.attrs.class) {
        delete node.attrs.class
      }
    }

    if (node.tag) {
      node.attrs = node.attrs || {}

      // fix img alt
      if (node.tag === 'img') {
        node.attrs.alt = node.attrs.alt || ''
      }

      // fix button type
      if (node.tag === 'button') {
        node.attrs.type = node.attrs.type || 'button'
      }
    }

    return node
  })

  tree.match(match('style'), (style) => {
    const css = toString(style.content)

    if (css) {
      promises.push(
        processor
          .process(css, { ...postcssrc_sync.options, from: from || undefined })
          .then(result => {
            style.content = [result.css]
          })
      )
    }

    return style
  })

  invalidSelector.forEach((value) => {
    throw Error('Invalid selector: ' + value)
  })

  return await Promise.all(promises).then(() => {
    if (!isDev) {
      tree.match(match('head'), (head) => {
        const placeholder: any = {
          tag: 'meta',
          attrs: {
            property: 'posthtml:view-head-placeholder',
            content: '*'
          }
        }

        if (head.content) {
          head.content.push(placeholder)

        } else {
          head.content = [placeholder]
        }

        return head
      })
    }

    return tree
  })
}

/**
 * parse component content
 */
function parseComponent(
  node: RawNode,
  component: ComponentMeta,
  options: OptionsUtils,
  isPage: boolean
) {
  return function (html: string) {
    if (typeof options.htmlProcessor === 'function') {
      html = options.htmlProcessor(html)
    }

    return processWithPostHtml(
      options.parser,
      options.plugins,
      html,
      [
        parseStyleAndScript(node, component, options),
        parseAttrsToLocals(component, node.attrs, options, isPage)
      ]
    )
  }
}

function parseStyleAndScript(
  componentNode: RawNode | null,
  component: ComponentMeta,
  options: OptionsUtils
) {
  getPostcssConfigSync()

  const {
    stylePreprocessor,
    styled: optionStyled,
    addClassIncludes,
    assets,
    noflip,
    cssjanus
  } = options

  const cssPreprocessor = (css: string) => {
    return Promise.resolve(stylePreprocessor(css))
  }

  return async function (tree: Tree) {
    const promises: Promise<any>[] = []

    let remove = false
    let scopedHash = ''
    let scopedClasses: ScopedClasses | null = null

    // merge style
    tree.match(match('style'), (style) => {
      const attrs: StyleAttrs = (style.attrs as any) || ({})
      const styled = normalizeStyled(optionStyled, attrs)
      const content = toString(style.content)

      let src = attrs['src'] as string

      // dynamic and php
      const dynamic = attrs['dynamic'] != null || isDynamicCss(content)

      if (src || content) {
        promises.push(
          Promise.resolve(null)
            .then(() => {
              if (src) {
                src = options.join(component.src, src)
                return fse.readFile(src, options.encoding)
              }

              return Promise.resolve(content)
            })
            .then((css) => {
              if (!css) return { code: '' }

              css = noflip(css)

              return cssPreprocessor(css)
            })
            .then((result) => {
              const resultCss = result && result.code

              return {
                ...result,
                code: cssjanus(resultCss || ''),
                to: (dynamic && styled.to === 'file') ? 'head' : styled.to,
                type: styled.type
              }
            })
        )
      }

      if (remove) {
        style.tag = false as any
        delete style.content
      }

      remove = true

      return style
    })

    if (promises.length > 0) {
      const merges = await Promise.all(promises)

      promises.length = 0

      const firstType = merges[0].type

      let scoped_css = ''
      let global_css = ''
      let to: StyleToSelector | undefined = optionStyled.to

      const start_mark = ':__posthtml_view_to_file_start_mark__{}'
      const end_mark = ':__posthtml_view_to_file_end_mark__{}'

      merges.forEach((item) => {
        // add mark
        if (item.to === 'file' && item.code) {
          item.code = `${start_mark}${item.code}${end_mark}`
        }

        if ('scoped' === item.type) {
          scoped_css = scoped_css + (item.code || '')
        }

        if ('global' === item.type) {
          global_css = global_css + (item.code || '')
        }

        if (item.to !== 'file' && item.to !== optionStyled.to) {
          to = item.to
        }
      })

      const ast = postcssScopedParser(
        scoped_css,
        component.resolveId,
        options,
        component.src,
        start_mark,
        end_mark,
        false
      )

      const globalAst = postcssScopedParser(
        global_css,
        component.resolveId,
        options,
        component.src,
        start_mark,
        end_mark,
        true
      )

      scoped_css = ast.css
      scopedHash = ast.scopedHash
      scopedClasses = ast.scopedClasses

      // global
      global_css = globalAst.css

      globalAst.scopedClasses.assetsCache.forEach((e) => {
        scopedClasses && scopedClasses.assetsCache.add(e)
      })

      globalAst.scopedClasses.assetsCache.clear()

      merges.length = 0

      const replaceCss = (css: string) => {
        let fileCss = ''

        css = css.replace(
          /:__posthtml_view_to_file_start_mark__{}(.*?):__posthtml_view_to_file_end_mark__{}/gs,
          function (_, matchCss) {
            fileCss = fileCss + matchCss
            return ''
          }
        )

        return {
          css,
          fileCss
        }
      }

      const scoped_replace = replaceCss(scoped_css)
      const global_replace = replaceCss(global_css)

      scoped_css = scoped_replace.css
      global_css = global_replace.css

      let to_file_css = ''

      if (firstType === 'global') {
        to_file_css = global_replace.fileCss + scoped_replace.fileCss

      } else {
        to_file_css = scoped_replace.fileCss + global_replace.fileCss
      }

      tree.match(match('style'), (style) => {
        if (firstType === 'global') {
          style.content = [global_css + scoped_css]
        } else {
          style.content = [scoped_css + global_css]
        }

        scoped_css = ''
        global_css = ''

        style.attrs = style.attrs || {}

        style.attrs['data-to'] = to
        style.attrs['data-scoped-hash'] = scopedHash
        style.attrs['data-resolve-id'] = component.resolveId

        delete style.attrs['scoped']
        delete style.attrs['global']
        delete style.attrs['src']
        delete style.attrs['to']
        delete style.attrs['dynamic']

        return style
      })

      if (to_file_css && Array.isArray(tree)) {
        tree.push({
          tag: 'style',
          attrs: {
            'data-to': 'file',
            'data-scoped-hash': scopedHash,
            'data-resolve-id': component.resolveId
          },
          content: to_file_css
        })
      }
    }

    // js
    const jsPrefix = options.prefix('js')

    tree.match(match('script'), (node) => {
      node.attrs = (node.attrs || {})

      let src = node.attrs.src

      if (src && /^(https?:)?\/\//.test(src)) {
        return node
      }

      if (node.attrs[jsPrefix] === 'null' || node.attrs[jsPrefix] === 'false') {
        delete node.attrs[jsPrefix]
        return node
      }

      if (src && node.attrs.type && node.attrs.type === 'module') {
        node.attrs.src = options.join(component.src, src)
        node.attrs.src = options.slash(node.attrs.src, true)
        return node
      }

      if (node.attrs.type && node.attrs[jsPrefix] == null) {
        return node
      }

      // view:js
      if (src) {
        src = options.join(component.src, src)
        node.attrs.src = options.slash(src, true)
      }

      node.attrs['data-to'] = node.attrs.to
      node.attrs['data-scoped-hash'] = scopedHash
      node.attrs['data-resolve-id'] = component.resolveId

      delete node.attrs.to

      return node
    })

    tree.walk((node) => {
      if (typeof node === 'string') return node

      node.attrs = node.attrs || {}

      const scopedCls = scopedClasses

      if (scopedCls && scopedHash && node.tag) {
        const attrs = node.attrs
        const classNames = attrs.class || ''

        const includes = (_attrs) => {
          if (addClassIncludes && addClassIncludes.length) {
            _attrs = {}

            addClassIncludes.forEach((attr) => {
              _attrs[attr] = attrs[attr]
            })
          }

          for (const key in _attrs) {
            if (Object.prototype.hasOwnProperty.call(_attrs, key)) {
              const values = _attrs[key] || ''

              if (scopedCls.classNames.some(c => values.includes(c))) {
                return true
              }
            }
          }

          return false
        }

        if (
          (scopedCls.tags[node.tag] || includes(attrs)) &&
          !classNames.includes(scopedHash)
        ) {
          node.attrs.class = `${scopedHash} ${classNames}`.trim()
        }
      }

      // Inline style
      if (node.attrs.style) {
        promises.push(
          processor
            .process(node.attrs.style, { ...postcssrc_sync.options, from: component.src || undefined })
            .then(result => {
              const s = '.__posthtml_view_inline_css_123456_abcdef__{'
              const ast = postcssScopedParser(
                `${s}${result.css}}`,
                component.resolveId,
                options,
                component.src,
                '',
                '',
                true
              )

              ast.scopedClasses.assetsCache.forEach((e) => {
                scopedClasses && scopedClasses.assetsCache.add(e)
              })

              ast.scopedClasses.assetsCache.clear()

              const css = ast.css.replace(s, '').replace('}', '')

              node.attrs && (node.attrs.style = cssjanus(css))
            })
        )
      }

      Object.keys(node.attrs).forEach(attrKey => {
        if (!assets.attributes.includes(attrKey) && assets.attrRegExp.test(attrKey)) {
          assets.attributes.push(attrKey)
        }
      })

      const assets_include = typeof assets._include === 'function' && assets._include

      const assetsHandle = (rawUrl: string) => {
        if (!String(rawUrl).trim()) {
          return rawUrl
        }

        if (assets_include && !assets_include(rawUrl)) {
          return rawUrl
        }

        if (
          isExternalUrl(rawUrl) ||
          isDataUrl(rawUrl) ||
          rawUrl.startsWith('#') ||
          dynamicTest(rawUrl)
        ) {
          return rawUrl
        }

        let url = options.join(component.src, rawUrl)
        url = options.slash(url, true)

        scopedClasses && scopedClasses.assetsCache.add(url)

        return url
      }

      assets.attributes.forEach((attrKey) => {
        if (node.attrs[attrKey]) {

          const rawUrl = node.attrs[attrKey]
          let replace

          const url = rawUrl.replace(/('|")(.*?)('|")/g, (match, a, url, c) => {
            replace = true

            return `${a}${assetsHandle(url)}${c}`
          })

          node.attrs[attrKey] = !replace
            ? assetsHandle(rawUrl)
            : url
        }
      })

      return node
    })

    if (promises.length > 0) {
      await Promise.all(promises)
      promises.length = 0
    }

    // assets
    if (options.mode !== 'development' && scopedClasses && scopedClasses.assetsCache.size) {
      const div: any = {
        tag: 'div',
        attrs: {
          '__posthtml_view_assets_div__': true,
          'style': 'display:none;'
        },
        content: []
      }

      scopedClasses.assetsCache.forEach((url) => {
        if (isFont(url)) {
          div.content.push({
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              href: url,
              'data-raw-url': url,
            }
          })

        } else {
          div.content.push({
            tag: 'img',
            attrs: {
              src: url,
              'data-raw-url': url,
            },
          })
        }
      })

      if (div.content.length && Array.isArray(tree)) {
        tree.push(div)
      }

      scopedClasses.assetsCache.clear()
    }

    return tree
  }
}

function normalizeStyled(styled: Partial<StyledOptions>, attrs: StyleAttrs): StyledOptions {
  // {
  //   type: 'scoped',
  //   to: 'head',
  // }
  styled = { ...styled }

  styled.to = attrs.to || styled.to || 'head'

  let type = styled.type

  if (attrs.scoped != null) {
    type = 'scoped'

  } else if (attrs.global != null) {
    type = 'global'
  }

  styled.type = type || 'scoped'

  return styled as StyledOptions
}

/**
 * read component file
 */
function readComponentFile(component: ComponentMeta, encoding: OptionsUtils['encoding']) {
  if (component.source != null) {
    return Promise.resolve(component.source || '')
  }

  return fse.readFile(component.src, encoding)
}

/**
 * get components
 */
function getComponent(
  attrs,
  tag: string,
  components: Components,
  options: OptionsUtils
): ComponentMeta | void {
  // <test-component view:query="global"></test-component>
  const queryPrefix = options.prefix('query')
  const view_query: 'global' | (string & {}) = attrs[queryPrefix] || ''

  if (view_query === 'global') {
    return options.components[tag]
  }

  return components[tag] || options.components[tag]
}

/**
 * register page components
 */
function matchComponents(tree: Tree, {
  from: htmlFilePath,
  prefix,
  join,
  slash,
}: OptionsUtils) {
  const components: Components = {}

  // <view:components>
  //   <tag-name-a src="a-src" {...attrs}></tag-name-a>
  //   <tag-name-b src="b-src"></tag-name-b>
  // </view:components>
  tree.match(match(prefix('components')), (node) => {
    if (node.content) {
      node.content.forEach((element) => {
        if (typeof element === 'string') return

        let { src, ...locals } = element.attrs || {}

        if (element.tag && src) {
          src = join(htmlFilePath, src)

          components[element.tag] = {
            tag: element.tag,
            src: src,
            resolveId: slash(src),
            locals
          }
        }
      })
    }

    // @ts-ignore
    node.tag = false
    delete node.content

    return node
  })

  // <view:component src="src" {...attrs}></view:component>
  tree.match(match(prefix('component')), (node) => {
    const attrs = node.attrs || {}
    let remove = false

    if (attrs.src) {
      // { tag: 'view:component', attrs: { src: 'src' } }
      const tag = 'view-src-' + getTag(attrs.src)
      const src = join(htmlFilePath, attrs.src)

      components[tag] = {
        tag: tag,
        src: src,
        resolveId: slash(src),
        locals: {}
      }

      node.tag = tag
      delete attrs.src

    } else {
      remove = true
    }

    if (remove) {
      // @ts-ignore
      node.tag = false
      delete node.content
    }

    return node
  })

  return components
}

function toString(css) {
  return [].concat(css || '').join('').trim()
}

function concatContent(...add) {
  return [].concat(...add).filter(Boolean)
}
