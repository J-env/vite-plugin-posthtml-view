import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import history from 'connect-history-api-fallback'
import { createFilter } from '@rollup/pluginutils'
import { minify, Options as MinifyOptions } from 'html-minifier-terser'
import posthtml from 'posthtml'
import match from 'posthtml-match-helper'
import { merge } from 'lodash'
import { slugify } from '../utils/slugify'
// import shell from 'shelljs'
import path from 'path'

import { getConfig, getHistoryReWriteRuleList, getEntryIndexHtmlName } from './utils'
import { encryptHtml, decryptHtml, htmlConversion } from './html'
import { postHTMLPluginView } from '../posthtml-plugin/index'
import type { VitePluginOptions, PluginOptions } from '../types'
import { requireMock, writeTemplate } from './dev'
import { phpRenderToHtml } from './php'

const cssjanus = require('cssjanus')

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

/**
 * vite-plugin-posthtml-view
 * @param _opts
 * @returns
 */
export function vitePluginPosthtmlView(_opts?: Partial<PluginOptions>): Plugin[] {
  const options: PluginOptions = merge<VitePluginOptions, any>({
    includes: [],
    ignore: [],
    pagesDirectory: 'pages',
    mocksDirectory: 'mocks',
    distPagesDirectory: 'pages',
    usePlugins: null,
    php: {
      rename: false
    },
    cssjanus: {
      transformDirInUrl: false,
      transformEdgeInUrl: false
    },
    minifyHtml: true
  }, _opts || {})

  options.pagesDirectory = options.pagesDirectory || 'pages'
  options.distPagesDirectory = options.distPagesDirectory || options.pagesDirectory

  if (typeof options.minifyHtml === 'boolean') {
    options.minifyHtml && (options.minifyHtml = minifyHtml)

  } else {
    options.minifyHtml = {
      ...minifyHtml,
      ...options.minifyHtml,
    }
  }

  options.getOptions = (opts) => {
    options.cacheDirectory = opts.cacheDirectory || '.posthtml-view-cache'
    options.styled = opts.styled
  }

  const posthtmlAsync = async function (html: string, from: string, options: PluginOptions) {
    try {
      const processor = posthtml([
        postHTMLPluginView({
          ...options,
          styled: {
            ...options.styled,
            removeDataStyledAttr: false
          },
          from
        }),
        ...(options.plugins || [])
      ])

      if (typeof options.usePlugins === 'function') {
        options.usePlugins(processor)
      }

      const result = await processor.process(html, {
        directives: [
          { name: '!DOCTYPE', start: '<', end: '>' },
          { name: '?php', start: '<', end: '>' },
          { name: '?=', start: '<', end: '>' },
        ],
        ...options.parser,
        sync: false
      })

      return result.html

    } catch (e) {
      throw new Error(String(e))
    }
  }

  const posthtmlViewPages: () => Plugin = () => {
    const name = 'view:posthtml-view-pages'

    let config: ResolvedConfig
    let server: ViteDevServer

    const pageSourceCache: Record<string, string> = {}
    const cssSourceCache: Record<string, string> = {}
    const jsSourceCache: Record<string, string> = {}

    function getSourceCache(id: string, cache: any) {
      if (!cache) return ''
      return cache[id] || ''
    }

    const getPageSourceCache = function (id: string) {
      return getSourceCache(id, pageSourceCache)
    }

    const getStyledSourceCache = function (id: string) {
      return getSourceCache(id, cssSourceCache)
    }

    const getJsSourceCache = function (id: string) {
      return getSourceCache(id, jsSourceCache)
    }

    return {
      name: name,
      enforce: 'pre',

      config(conf, { mode }) {
        getConfig(conf, options)
      },

      configResolved(_config) {
        config = _config

        options.root = config.root
        options.mode = config.command === 'build' ? 'production' : 'development'
      },

      configureServer(_server) {
        server = _server

        _server.middlewares.use(
          // @see https://github.com/vitejs/vite/blob/8733a83d291677b9aff9d7d78797ebb44196596e/packages/vite/src/node/server/index.ts#L433
          // @ts-ignore
          history({
            verbose: Boolean(process.env.DEBUG) && process.env.DEBUG !== 'false',
            disableDotRule: undefined,
            htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
            rewrites: getHistoryReWriteRuleList(options),
          })
        )
      },

      transformIndexHtml: {
        enforce: 'pre',
        async transform(html, ctx) {
          const pagesDir = path.resolve(config.root, options.pagesDirectory)
          const file = getEntryIndexHtmlName(ctx.filename, pagesDir)

          if (options.php) {
            html = encryptHtml(html)
          }

          html = await posthtmlAsync(html, ctx.filename, {
            ...options,
            styled: {
              extract: (meta) => {
                const isDev = config.command === 'serve'

                let slug = meta.componentName

                if (!isDev) {
                  slug = slugify(meta.componentName + (meta.source || ''))
                }

                const cssFileName = slug + '.css?__posthtml_view__'

                cssSourceCache[cssFileName] = meta.source || ''

                let importCss = `import '${cssFileName}';`
                let mainjs = ''

                // 不是创建的虚拟入口
                if (!meta.main.includes('?__posthtml_view__')) {
                  // 把之前的 入口作为虚拟入口拼接进去
                  const pageEnterImportSource = `import '${meta.main}?__posthtml_view__=inject-page-main';`
                  const prev_source = pageSourceCache[meta.main] || ''

                  if (!prev_source.includes(pageEnterImportSource)) {
                    mainjs = pageEnterImportSource
                  }
                }

                const prev_source = (pageSourceCache[meta.main] || '') + mainjs

                if (!prev_source.includes(importCss)) {
                  pageSourceCache[meta.main] = prev_source + importCss
                }
              },
              ...options.styled,
            },
            js: {
              extract: (meta) => {
                const isDev = config.command === 'serve'

                let slug = meta.src || meta.componentName + '.' + meta.type

                if (!isDev) {
                  slug = slugify(slug)
                }

                const jsFileName = slug + '?__posthtml_view__'
                let importJs = `import '${jsFileName}';`

                if (!meta.src) {
                  jsSourceCache[jsFileName] = meta.source || ''
                }

                if (!meta.main.includes('?__posthtml_view__')) {
                  // 把之前的 入口作为虚拟入口拼接进去
                  const pageEnterImportSource = `import '${meta.main}?__posthtml_view__=inject-page-main';`
                  const prev_source = pageSourceCache[meta.main] || ''

                  if (!prev_source.includes(pageEnterImportSource)) {
                    importJs = pageEnterImportSource + importJs
                  }
                }

                const prev_source = (pageSourceCache[meta.main] || '')

                if (!prev_source.includes(importJs)) {
                  pageSourceCache[meta.main] = prev_source + importJs
                }
              },
              ...options.js,
            }
          })

          // dev server
          if (server) {
            if (options.php) {
              html = decryptHtml(html)
              html = htmlConversion(html)

              if (typeof options.php.devRender === 'function') {
                html = await options.php.devRender({
                  html,
                  options
                })

              } else {
                const mockPath = path.join(config.root, options.mocksDirectory, file.replace('.html', '.ts'))

                const [mock, { tplFileName, __views }] = await Promise.all([
                  requireMock(mockPath, true),
                  writeTemplate(html, config.root, options.cacheDirectory, file)
                ])

                html = await phpRenderToHtml(tplFileName, {
                  __views: __views,
                  ...mock
                })
              }

              return html || `<div style="text-align:center;"><h1>${name}</h1><p>No content</p></div>`
            }
          }

          // build
          return html
        }
      },

      async resolveId(id) {
        // posthtml 提取css到文件中 文件路径
        if (getPageSourceCache(id)) {
          return id
        }

        // posthtml 模块化css 文件路径
        if (getStyledSourceCache(id)) {
          return id
        }

        if (getJsSourceCache(id)) {
          return id
        }

        return null
      },

      async load(id) {
        if (getPageSourceCache(id)) {
          return getPageSourceCache(id)
        }

        if (getStyledSourceCache(id)) {
          return getStyledSourceCache(id)
        }

        if (getJsSourceCache(id)) {
          return getJsSourceCache(id)
        }

        return null
      },

      async handleHotUpdate({ file, server }) {
        if (
          file.indexOf('/' + options.mocksDirectory) >= 0 || file.endsWith('.html')
        ) {
          server.ws.send({
            type: 'full-reload',
            path: '*',
          })
        }
      },
    }
  }

  const posthtmlViewBundle: () => Plugin = () => {
    const filter = createFilter(['**/*.html'])

    // let config: ResolvedConfig

    return {
      name: 'view:posthtml-view-bundle',
      enforce: 'post',
      apply: 'build',

      // configResolved(_config) {
      //   config = _config
      // },

      async generateBundle(_options, outBundle) {
        const normalizeHtml = async (source: string) => {
          return (await posthtml([])
            .use((tree) => {
              tree.match(match('head'), (head) => {
                const css: string[] = []

                tree.match(match('style[data-posthtml-view-styled]'), (node) => {
                  const content = String(node.content || '').trim()

                  if (content && !css.includes(content)) {
                    css.push(content)
                  }

                  node.tag = false as any
                  delete node.content

                  return node
                })

                const content: any[] = css.map(item => ({
                  tag: 'style',
                  content: item
                }))

                head.content = [...(head.content || []), ...content]

                return head
              })
            })
            .process(source, {})).html
        }

        for (const bundle of Object.values(outBundle)) {
          // == remove css in js ========================
          // if (bundle.type === 'chunk' && bundle.fileName.includes('-legacy')) {
          // }

          // == rtl css ========================
          if (
            options.styled && options.styled.rtl &&
            bundle.type === 'asset' &&
            bundle.fileName.endsWith('.css')
          ) {
            const rtlFileName = bundle.fileName.replace('.css', '.rtl.css')

            const rtlCss = cssjanus.transform(bundle.source, options.cssjanus)

            this.emitFile({
              type: 'asset',
              fileName: rtlFileName,
              name: bundle.name ? bundle.name.replace('.css', '.rtl.css') : undefined,
              source: rtlCss
            })
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

            if (options.distPagesDirectory !== options.pagesDirectory) {
              const i = bundle.fileName.indexOf(options.pagesDirectory)

              if (i >= 0) {
                bundle.fileName = options.distPagesDirectory
                  + bundle.fileName.slice(i + options.pagesDirectory.length)
              }
            }

            // to php
            if (options.php && options.php.rename) {
              const renameHandle = (match: string, to: string) => {
                bundle.fileName = bundle.fileName.replace(match, to)

                if (bundle.name) {
                  bundle.name = bundle.name.replace(match, to)
                }
              }

              renameHandle('.html', '.php')
            }
          }
        }
      },

      closeBundle() {
        // const { root, pagesDirectory, distPagesDirectory } = options
        // const dest = (config.build && config.build.outDir) || 'dist'
        // const resolve = (p: string) => path.resolve(root, p)

        // if (!shell.test('-e', resolve(dest))) {
        //   return
        // }

        // if (distPagesDirectory !== pagesDirectory) {
        //   // 创建指定页面目录
        //   shell.mkdir('-p', resolve(`${dest}/${distPagesDirectory}`))

        //   // 移动 dest/src/${pagesDirectory}/* 到 dest/distPagesDirectory/*
        //   shell.mv(resolve(`${dest}/${pagesDirectory}/*`), resolve(`${dest}/${distPagesDirectory}`))

        //   // 删除空的 desc/src 目录
        //   shell.rm('-rf', resolve(`${dest}/${pagesDirectory}`))
        // }
      }
    }
  }

  return [
    posthtmlViewPages(),
    posthtmlViewBundle()
  ]
}

function stringSource(source: string | Uint8Array) {
  if (source instanceof Uint8Array) {
    return Buffer.from(source).toString('utf-8')
  }

  return source
}
