import path from 'path'
import type { Plugin, ResolvedConfig } from 'vite'
import { createFilter } from '@rollup/pluginutils'
// import shell from 'shelljs'
import posthtml, { RawNode } from 'posthtml'
import match from 'posthtml-match-helper'

import type { PluginOptions, RtlOptions, MinifyClassnames } from '../types'
import { decryptHtml, htmlConversion } from '../utils/html'
import { placeholderToNoflip, cssjanus } from '../utils/rtl'
import { toValidCSSIdentifier } from '../utils'
import { minifyClassesHandle, joinValues, htmlFor, useTagId, writeCache } from './classes'
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
  classNameSlug: null,
  enableCache: true,
  generateNameFilters: [],
  upperCase: true,
  filters: [/^(\.|#)js-/],
  attributes: [],
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

export function posthtmlViewBundle(options: PluginOptions, rtl: RtlOptions | false): Plugin {
  const filter = createFilter(['**/*.html'])

  let config: ResolvedConfig

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
    const sm = syntax.match(/(.*)\[\[(rtl|ltr)\]\](.*)\[\[(rtl|ltr)\]\](.*)/si)

    // ["<?php if($rtl): ?>", "rtl", "<?php else: ?>", "ltr", "<?php endif; ?>"]
    if (sm && sm.length >= 6) {
      syntaxArr = sm.slice(1).map(item => item.trim()).filter(Boolean)
    }
  }

  const normalizeHtml = async (source: string) => {
    return (await posthtml([])
      .use((tree) => {
        tree.match(match('head'), (head) => {
          const css: string[] = []

          tree.match(match('style[__posthtml_view_css__]'), (style) => {
            const content = [].concat((style.content as []) || '').join('').trim()

            if (content && !css.includes(content)) {
              css.push(content)
            }

            style.tag = false as any
            delete style.content

            return style
          })

          const content: any[] = css.map((item) => ({
            tag: 'style',
            content: item
          }))

          if (head.content) {
            const index = getTargetNodeIndex(head.content)

            if (index === null) {
              head.content = [...head.content, ...content]

            } else {
              head.content.splice(index + 1, 0, ...content)
            }

          } else {
            head.content = content
          }

          return head
        })

        if (minifyOptions) {
          tree.match(match('style'), (style) => {
            if (style.attrs && style.attrs['data-min-class-ignore'] != null) {
              delete style.attrs['data-min-class-ignore']
              return style
            }

            const content = [].concat((style.content as []) || '').join('').trim()

            if (content) {
              style.content = [minifyClassesHandle(content, minifyOptions, options)]
            }

            return style
          })
        }

        return tree
      })
      .use((tree) => {
        if (minifyOptions) {
          tree.walk((node) => {
            if (node.attrs) {
              if (minifyOptions.attributes && minifyOptions.attributes.length) {
                const attrs = Object.keys(node.attrs)

                minifyOptions.attributes.forEach((item) => {
                  if (item === 'id' || item === 'class') return

                  const at = attrs.find(attr => attr.includes(item))

                  if (at) {
                    node.attrs[at] = joinValues(node.attrs[at])
                  }
                })
              }

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
                    node.attrs[item] = `url(#${tagId})`
                  }
                }
              })
            }

            // svg
            if (
              node.tag === 'use' &&
              node.attrs &&
              (node.attrs.href || node.attrs['xlink:href'])
            ) {
              const useAttr = node.attrs.href ? 'href' : 'xlink:href'
              const tagId = useTagId(node.attrs[useAttr] || '')

              if (tagId) {
                node.attrs[useAttr] = tagId
              }
            }

            return node
          })
        }

        return tree
      })
      .use((tree) => {
        const syntaxStyleTag = 'posthtml-view-syntax-style-x'

        tree.match(match('style'), (style) => {
          let content = [].concat((style.content as []) || '').join('').trim()

          // remove    noflip placeholder
          content = content && placeholderToNoflip(content, '')

          // '<?php if($rtl): ?>[[rtl]]<?php else: ?>[[ltr]]<?php endif; ?>'
          if (content && syntaxArr && syntaxArr.length) {
            const rtlContent = janusCss(content)

            if (rtlContent !== content) {
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
                    content,
                  } as any
                }

                return item
              })

              style.tag = false as any
              style.attrs = undefined

              return style
            }
          }

          if (content) {
            style.content = [content]
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

          return _tree || tree
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
          minifyOptions.__cache_file__ = path.resolve(config.root, path.join(options.cacheDirectory, 'css', '_css.js'))

        } else {
          minifyOptions.__cache_file__ = ''
        }
      }

      for (const bundle of Object.values(bundles)) {
        // == rtl css ========================
        if (bundle.type === 'asset' && bundle.fileName.endsWith('.css')) {
          let source = stringSource(bundle.source)

          if (minifyOptions) {
            source = minifyClassesHandle(source, minifyOptions, options)
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
            const html = (await posthtml([])
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

                return tree
              })
              .process(source, {})).html

            if (html) {
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
          bundle.type === 'chunk' && bundle.fileName.includes('-legacy') &&
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

function getTargetNodeIndex(content) {
  const length = content.length

  // [].splice
  let index: number | null = null

  for (let i = length - 1; i >= 0; i--) {
    const elem = content[i] as RawNode

    if (typeof elem === 'string') {
      continue
    }

    const attrs = elem.attrs || {}

    const hasLinkCss = (elem.tag === 'link' && attrs.rel === 'stylesheet')

    const hasModule = hasLinkCss ||
      (elem.tag === 'link' && attrs.rel === 'modulepreload') ||
      (elem.tag === 'script' && attrs.type === 'module' && attrs.src)

    if (hasModule) {
      index = i
      break
    }
  }

  return index
}
