import type { Plugin } from 'vite'
import { createFilter } from '@rollup/pluginutils'
// import shell from 'shelljs'
import posthtml, { RawNode } from 'posthtml'
import match from 'posthtml-match-helper'
import { minify, Options as MinifyOptions } from 'html-minifier-terser'

import { decryptHtml, htmlConversion } from '../utils/html'
import { placeholderToNoflip, cssjanus } from '../utils/rtl'
import type { PluginOptions, RtlOptions } from '../types'

const minifyHtml: MinifyOptions = {
  collapseBooleanAttributes: true,
  collapseWhitespace: true,
  minifyCSS: true,
  minifyJS: true,
  minifyURLs: true,
  removeAttributeQuotes: true,
  removeComments: true,
  html5: true,
  keepClosingSlash: true,
  removeEmptyAttributes: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true
}

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
  if (typeof options.minifyHtml === 'boolean') {
    options.minifyHtml && (options.minifyHtml = minifyHtml)

  } else {
    options.minifyHtml = {
      ...minifyHtml,
      ...options.minifyHtml,
    }
  }

  const filter = createFilter(['**/*.html'])

  // let config: ResolvedConfig

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
        tree.match((match('head')), (head) => {
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
        }

        return Promise.resolve().then(() => {
          tree.match(match(syntaxStyleTag), (node) => {
            node.tag = 'style'
            return node
          })

          return tree
        })
      })
      .process(source, {}))
      .html
  }

  return {
    name: 'view:posthtml-view-bundle',
    enforce: 'post',
    apply: 'build',

    // configResolved(_config) {
    //   config = _config
    // },

    async generateBundle(gb, bundles, isWrite) {
      for (const bundle of Object.values(bundles)) {
        // == remove css in js ========================
        // if (bundle.type === 'chunk' && bundle.fileName.includes('-legacy')) {
        // }

        // == rtl css ========================
        if (bundle.type === 'asset' && bundle.fileName.endsWith('.css')) {
          const source = stringSource(bundle.source)

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
          if (options.minifyHtml) {
            source = await minify(source, options.minifyHtml as MinifyOptions)
          }

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
      }
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

    const hasLinkCss = (
      elem.tag === 'link' &&
      attrs.rel === 'stylesheet' &&
      // todo
      (attrs.href && (attrs.href as string).endsWith('.css'))
    )

    const hasModule = hasLinkCss ||
      (elem.tag === 'link' && attrs.rel === 'modulepreload') ||
      (elem.tag === 'script' && attrs.type === 'module')

    if (hasModule) {
      index = i
      break
    }
  }

  return index
}
