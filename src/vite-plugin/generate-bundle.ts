import path from 'path'
import type { Plugin, ResolvedConfig } from 'vite'
import { createFilter } from '@rollup/pluginutils'
// import shell from 'shelljs'
import posthtml from 'posthtml'
import match from 'posthtml-match-helper'

import type { PluginOptions, RtlOptions, MinifyClassnames } from '../types'
import { decryptHtml, htmlConversion } from '../utils/html'
import { placeholderToNoflip, cssjanus } from '../utils/rtl'
import { toValidCSSIdentifier } from '../utils'
import { createGenerator, minifyClassesHandle, joinValues, htmlFor, useTagId, writeCache } from './classes'
import { minifyHtml } from './html'

const rtlMark = '[[rtl]]'
const ltrMark = '[[ltr]]'

const defaultRtlOptions: RtlOptions = {
  type: 'syntax',

  syntax: `<?php if($rtl): ?>${rtlMark}<?php else: ?>${ltrMark}<?php endif; ?>`,

  devPreview: (originalUrl) => {
    if (
      originalUrl &&
      (
        originalUrl.includes('rtl=1') ||
        originalUrl.includes('lang=ar')
      )
    ) {
      return true
    }

    return false
  }
}

const defaultMinifyOptions: MinifyClassnames = {
  enableCache: true,
  generateNameFilters: [],
  upperCase: true,
  filters: [/^(\.|#)js-/],
  attributes: [],
  blurryAttrs: [],
  prefix: '',
  __cache_file__: ''
}

let minifyOptions: MinifyClassnames

export function getRtlOptions(options: PluginOptions): RtlOptions | false {
  return typeof options.rtl === 'boolean'
    ? options.rtl
      ? defaultRtlOptions
      : false
    : {
      ...defaultRtlOptions,
      ...options.rtl
    }
}

const syntaxReg = /(.*)\[\[(rtl|ltr)\]\](.*)\[\[(rtl|ltr)\]\](.*)/si

export function posthtmlViewBundle(options: PluginOptions, rtl: RtlOptions | false): Plugin {
  const filter = createFilter(['**/*.html'])

  let config: ResolvedConfig

  let preloadCss = options.preloadCss === false ? false : true

  const { type, syntax } = rtl ? rtl : defaultRtlOptions

  const janusCss = (css: string) => cssjanus(css, {
    transformDirInUrl: rtl && rtl.transformDirInUrl || false,
    transformEdgeInUrl: rtl && rtl.transformEdgeInUrl || false,
  })

  const correctSyntax = () => {
    return syntax && (syntax.includes(rtlMark) || syntax.includes(ltrMark))
  }

  let syntaxArr: string[] | null = null

  if (rtl && type === 'syntax' && correctSyntax()) {
    const sm = syntax.match(syntaxReg)

    // ["<?php if($rtl): ?>", "rtl", "<?php else: ?>", "ltr", "<?php endif; ?>"]
    if (sm && sm.length >= 6) {
      syntaxArr = sm.slice(1).map(item => item.trim()).filter(Boolean)
    }
  }

  const bools = [
    'crossorigin',
    'nomodule',
    'defer',
    'async',
    'hidden',
    'x-transition',
    'x-ignore',
    'x-cloak',
    'x-collapse',
    ...(options.boolAttrs || [])
  ]

  const assetsCss: string[] = []
  const assetsJs: string[] = []

  function boolsAttrsHandle(tree) {
    tree.walk((node) => {
      if (node.attrs) {
        const attrs = Object.keys(node.attrs)

        attrs.forEach((attrKey) => {
          if (node.attrs[attrKey] === '' && bools.some(item => item.indexOf(attrKey) === 0)) {
            node.attrs[attrKey] = true
          }
        })
      }

      return node
    })
  }

  const normalizeHtml = async (source: string) => {
    return (await posthtml([])
      .use((tree) => {
        tree.match(match('head'), (head) => {
          const links: any[] = []

          tree.match.call(head, match('link[rel="preload"][as="style"][href]'), (link) => {
            // @ts-ignore
            link.tag = false

            return link
          })

          tree.match.call(head, match('link[rel="stylesheet"][href]'), (link) => {
            const attrs = link.attrs || {}

            if (link.tag && attrs.href && assetsCss.some(href => attrs.href && attrs.href.includes(href))) {
              if (preloadCss) {
                links.push({
                  tag: 'link',
                  attrs: {
                    ...attrs,
                    rel: 'preload',
                    as: 'style',
                    href: attrs.href,
                  }
                })
              }

              links.push({
                tag: 'link',
                attrs
              })

              // @ts-ignore
              link.tag = false
            }

            return link
          })

          tree.match.call(head, match('script[type="module"][src],link[rel="modulepreload"][href]'), (node) => {
            const attrs = node.attrs || {}
            const href = attrs.href || attrs.src

            if (node.tag && href && assetsJs.some(js => href.includes(js))) {
              links.push({
                tag: node.tag,
                attrs
              })

              // @ts-ignore
              node.tag = false
            }

            return node
          })

          const images: any[] = []

          tree.match.call(head, match('link[rel="preload"][as="image"][href]'), (link) => {
            const attrs = link.attrs || {}

            if (link.tag && attrs.href) {
              images.push({
                tag: 'link',
                attrs
              })

              // @ts-ignore
              link.tag = false
            }

            return link
          })

          const css: string[] = []

          tree.match.call(head, match('style[__posthtml_view_css__]'), (style) => {
            const content = toString(style.content)

            if (style.tag && content && !css.includes(content)) {
              css.push(content)
            }

            // @ts-ignore
            style.tag = false
            delete style.content

            return style
          })

          const content: any[] = css.map((item) => ({
            tag: 'style',
            content: item
          }))

          tree.match.call(head, match('meta[property="posthtml:view-head-placeholder"]'), (placeh) => {
            placeh.content = [...links, ...images, ...content]

            // @ts-ignore
            placeh.tag = false

            return placeh
          })

          return head
        })

        if (minifyOptions) {
          tree.match(match('style'), (style) => {
            if (style.attrs && style.attrs['data-min-class-ignore'] != null) {
              delete style.attrs['data-min-class-ignore']
              return style
            }

            const content = toString(style.content)

            if (content) {
              style.content = [minifyClassesHandle(content)]
            }

            return style
          })
        }

        return tree
      })
      .use((tree) => {
        type RawUrl = string
        type AssetsUrl = string

        const assets: Map<RawUrl, AssetsUrl> = new Map()

        const replaceAssets = (str: string) => {
          if (str && assets.size) {
            assets.forEach((assetsUrl, rawUrl) => {
              str = replaceAll(str, rawUrl, assetsUrl)
            })
          }

          return str
        }

        tree.match(match('div[__posthtml_view_assets_div__]'), (div) => {
          tree.match.call(div, match('[data-raw-url]'), (node) => {
            if (node.attrs && node.attrs['data-raw-url']) {
              assets.set(node.attrs['data-raw-url'], node.attrs.href || node.attrs.src || '')
            }

            // @ts-ignore
            node.tag = false

            return node
          })

          // @ts-ignore
          div.tag = false
          delete div.content

          return div
        })

        const assetsAttrs = options.assets.attributes
        const attrRegExp = options.assets.attrRegExp

        tree.walk((node) => {
          if (typeof node === 'string') return node

          if (node.attrs) {
            const attrs = Object.keys(node.attrs)

            attrs.forEach(attrKey => {
              if (!assetsAttrs.includes(attrKey) && attrRegExp.test(attrKey)) {
                assetsAttrs.push(attrKey)
              }
            })

            assetsAttrs && assetsAttrs.forEach((attrKey) => {
              if (node.attrs[attrKey]) {
                node.attrs[attrKey] = replaceAssets(node.attrs[attrKey])
              }
            })

            if (node.attrs.style) {
              node.attrs.style = replaceAssets(node.attrs.style)
            }

            const buildClass = (node.attrs['view-build-class'] || '').split(' ').filter(Boolean)

            delete node.attrs['view-build-class']

            if (minifyOptions) {
              const attributes = [
                ...minifyOptions.attributes,
                /^[xv]-transition/,
              ]

              const blurryAttrs = [
                ...minifyOptions.blurryAttrs,
                // /^([xv]-bind)?:class|^[xv]-data|^[xv]-scope/,
                /^([xv]-bind)?:class/,
              ]

              const asReplace = (arr, attr: string) => arr.some(item => {
                if (typeof item === 'string') return item === attr

                return item.test && item.test(attr)
              })

              const skip = (val: string) => {
                if (config.assetsInclude(val)) {
                  return true
                }

                if (buildClass.length) {
                  return !buildClass.includes(val)
                }

                return false
              }

              attrs.forEach((attr) => {
                if (attr === 'id' || attr === 'class') return

                // true
                if (typeof node.attrs[attr] !== 'string') {
                  return
                }

                if (typeof node.attrs[attr] === 'string' && !node.attrs[attr].trim()) {
                  return
                }

                if (asReplace(attributes, attr)) {
                  node.attrs[attr] = joinValues(node.attrs[attr], false, skip)

                } else if (asReplace(blurryAttrs, attr)) {
                  const rawValue: string = node.attrs[attr] || ''
                  let replace

                  const value = rawValue.replace(/('|")(.*?)('|")/g, (match, a, val, c) => {
                    replace = true

                    return `${a}${joinValues(val, false, skip)}${c}`
                  })

                  node.attrs[attr] = replace ? value : rawValue

                } else if (buildClass.length) {
                  buildClass.forEach(item => {
                    if (node.attrs[attr].includes(item)) {
                      const a = joinValues(item)

                      node.attrs[attr] = replaceAll(node.attrs[attr], item, a)
                    }
                  })
                }
              })

              if (node.attrs.class) {
                node.attrs.class = joinValues(node.attrs.class)
              }

              if (node.attrs.id) {
                node.attrs.id = joinValues(node.attrs.id, true)
              }

              if (node.attrs['for']) {
                const forId = htmlFor(node.attrs['for'])

                if (forId) {
                  node.attrs['for'] = forId
                }
              }

              // svg fill="url(#id)"
              const urls = ['mask', 'fill', 'filter']

              urls.forEach((item) => {
                if (node.attrs[item]) {
                  const tagId = useTagId(node.attrs[item].replace(/url\((.*?)\)/g, '$1'))

                  if (tagId) {
                    node.attrs[item] = `url(${tagId})`
                  }
                }
              })

              // svg
              if (
                node.tag === 'use' &&
                (node.attrs.href || node.attrs['xlink:href'])
              ) {
                const useAttr = node.attrs.href ? 'href' : 'xlink:href'
                const tagId = useTagId(node.attrs[useAttr] || '')

                if (tagId) {
                  node.attrs[useAttr] = tagId
                }
              }
            }
          }

          return node
        })

        const syntaxStyleTag = 'posthtml-view-syntax-style-x'

        tree.match(match('style'), (style) => {
          let content = replaceAssets([].concat((style.content as []) || '').join('').trim())

          // remove noflip placeholder
          let ltrContent = content && placeholderToNoflip(content, '')

          // '<?php if($rtl): ?>[[rtl]]<?php else: ?>[[ltr]]<?php endif; ?>'
          if (ltrContent && syntaxArr && syntaxArr.length) {
            const rtlContent = janusCss(content)

            if (rtlContent !== ltrContent) {
              style.content = syntaxArr.map(item => {
                if (item === 'rtl') {
                  return {
                    tag: syntaxStyleTag,
                    attrs: style.attrs,
                    content: rtlContent
                  } as any
                }

                if (item === 'ltr') {
                  return {
                    tag: syntaxStyleTag,
                    attrs: style.attrs,
                    content: ltrContent,
                  } as any
                }

                return item
              })

              style.tag = false as any
              style.attrs = undefined

              return style
            }
          }

          if (ltrContent) {
            style.content = [ltrContent]
          }

          return style
        })

        if (syntaxArr && syntaxArr.length) {
          tree.match(match('link[href]'), (link) => {
            const href = link.attrs && link.attrs.href

            if (link.attrs && href && href.endsWith('.css') && syntaxArr) {
              const rtlHref = href.replace('.css', '.rtl.css')

              link.attrs.href = syntaxArr.map(item => {
                if (item === 'rtl') {
                  return rtlHref
                }

                if (item === 'ltr') {
                  return href
                }

                return item
              }).join('')
            }

            return link
          })

          tree.match(match('html'), (node) => {
            if (syntaxArr) {
              node.attrs = node.attrs || {}

              node.attrs.dir = syntaxArr.map(item => {
                if (item === 'rtl') {
                  return 'rtl'
                }

                if (item === 'ltr') {
                  return 'ltr'
                }

                return item
              }).join('')
            }

            return node
          })

        } else {
          tree.match(match('html'), (node) => {
            node.attrs = node.attrs || {}
            node.attrs.dir = 'ltr'
            return node
          })
        }

        return Promise.resolve().then(() => {
          tree.match(match(syntaxStyleTag), (node) => {
            node.tag = 'style'
            return node
          })

          return tree
        })
      })
      .use((tree) => {
        return Promise.resolve().then(() => {
          let _tree

          if (typeof options.generateUsePlugins === 'function') {
            _tree = options.generateUsePlugins(tree)
          }

          return boolsAttrsHandle(_tree || tree)
        })
      })
      .process(source, {}))
      .html
  }

  return {
    name: 'view:posthtml-view-bundle',
    enforce: 'post',
    apply: 'build',

    configResolved(_config) {
      config = _config
    },

    async generateBundle(gb, bundles) {
      const minifyClassnames = options.minifyClassnames

      if (minifyClassnames && !minifyOptions) {
        minifyOptions = minifyClassnames === true
          ? defaultMinifyOptions
          : ({ ...defaultMinifyOptions, ...minifyClassnames })

        minifyOptions.prefix = minifyOptions.prefix && toValidCSSIdentifier(minifyOptions.prefix)

        minifyOptions.filters = [...minifyOptions.filters, '#vite-legacy-polyfill', '#vite-legacy-entry']

        if (minifyOptions.enableCache) {
          minifyOptions.__cache_file__ = path.join(config.root, path.join(options.cacheDirectory, 'css'))

        } else {
          minifyOptions.__cache_file__ = ''
        }

        createGenerator(minifyOptions)
      }

      const bundleValues = Object.values(bundles)

      for (const bundle of bundleValues) {
        if (bundle.fileName.endsWith('.js')) {
          !assetsJs.includes(bundle.fileName) && assetsJs.push(bundle.fileName)
        }

        // == rtl css ========================
        if (bundle.type === 'asset' && bundle.fileName.endsWith('.css')) {
          !assetsCss.includes(bundle.fileName) && assetsCss.push(bundle.fileName)

          let source = stringSource(bundle.source)

          if (minifyOptions) {
            source = minifyClassesHandle(source)
          }

          // ltr
          bundle.source = placeholderToNoflip(source, '')

          // rtl
          if (rtl) {
            this.emitFile({
              type: 'asset',
              fileName: bundle.fileName.replace('.css', '.rtl.css'),
              name: bundle.name ? bundle.name.replace('.css', '.rtl.css') : undefined,
              source: janusCss(source)
            })
          }
        }
      }

      for (const bundle of bundleValues) {
        // == html ========================
        if (bundle.type === 'asset' && filter(bundle.fileName)) {
          let source = stringSource(bundle.source)

          source = await normalizeHtml(source)

          // 1 把加密的解析出来, 方便压缩
          if (options.php) {
            source = decryptHtml(source)
          }

          // 2 压缩
          source = await minifyHtml(source, options)

          // 3 转换成php
          if (options.php) {
            source = htmlConversion(source)
          }

          // 4
          bundle.source = source

          const { fileName, name } = renameHandle(bundle.fileName, bundle.name, options)

          bundle.fileName = fileName
          bundle.name = name

          if (rtl && type === 'new-html') {
            let html = (await posthtml([])
              .use((tree) => {
                tree.match(match('html'), (node) => {
                  node.attrs = node.attrs || {}
                  node.attrs.dir = 'rtl'

                  return node
                })

                tree.match(match('link[href]'), (link) => {
                  if (
                    link.attrs &&
                    link.attrs.href && link.attrs.href.endsWith('.css')
                  ) {
                    link.attrs.href = link.attrs.href.replace('.css', '.rtl.css')
                  }

                  return link
                })

                tree.match(match('style'), (style) => {
                  const content = [].concat((style.content as []) || '').join('').trim()

                  if (content) {
                    style.content = [janusCss(content)]
                  }

                  return style
                })

                return boolsAttrsHandle(tree)
              })
              .process(source, {})).html

            if (html) {
              html = await minifyHtml(html, options)

              this.emitFile({
                type: 'asset',
                fileName: fileName.replace(/\.(html?|php)/g, '.rtl.$1'),
                name: name ? name.replace(/\.(html?|php)/g, '.rtl.$1') : undefined,
                source: html
              })
            }
          }
        }

        // == remove css in js ========================
        // @TODO:
        if (
          bundle.type === 'chunk' &&
          bundle.fileName.includes('-legacy') &&
          typeof options.removeCssInJs === 'function'
        ) {
          const code = options.removeCssInJs(stringSource(bundle.code))
          bundle.code = code || bundle.code
        }
      }

      await writeCache()
    },

    // closeBundle() {
    //   const { root, pagesDirectory, buildPagesDirectory } = options
    //   const dest = (config.build && config.build.outDir) || 'dist'
    //   const resolve = (p: string) => path.resolve(root, p)

    //   if (!shell.test('-e', resolve(dest))) {
    //     return
    //   }

    //   if (buildPagesDirectory !== pagesDirectory) {
    //     // 创建指定页面目录
    //     shell.mkdir('-p', resolve(`${dest}/${buildPagesDirectory}`))

    //     // 移动 dest/src/${pagesDirectory}/* 到 dest/buildPagesDirectory/*
    //     shell.mv(resolve(`${dest}/${pagesDirectory}/*`), resolve(`${dest}/${buildPagesDirectory}`))

    //     // 删除空的 desc/src 目录
    //     shell.rm('-rf', resolve(`${dest}/${pagesDirectory}`))
    //   }
    // }
  }
}

function renameHandle(fileName: string, name: string | undefined, options: PluginOptions) {
  const {
    buildPagesDirectory,
    pagesDirectory,
    php
  } = options

  if (buildPagesDirectory !== pagesDirectory) {
    const i = fileName.indexOf(pagesDirectory)

    if (i >= 0) {
      fileName = buildPagesDirectory + fileName.slice(i + pagesDirectory.length)
    }
  }

  // to php
  if (php && php.rename) {
    fileName = fileName.replace(/\.(html?)/g, '.php')

    if (name) {
      name = name.replace(/\.(html?)/g, '.php')
    }
  }

  return {
    fileName,
    name
  }
}

function stringSource(source: string | Uint8Array) {
  if (source instanceof Uint8Array) {
    return Buffer.from(source).toString('utf-8')
  }

  return source
}

function replaceAll(str: string, searchValue: string, replaceValue: string) {
  while (str.includes(searchValue)) {
    str = str.replace(searchValue, replaceValue)
  }

  return str
}

function toString(...css) {
  return [].concat(...css).filter(Boolean).join('').trim()
}
