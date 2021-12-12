import type { Plugin, ResolvedConfig } from 'vite'
import history from 'connect-history-api-fallback'
import { merge } from 'lodash'

import type { VitePluginOptions, PluginOptions } from '../types'
import { getConfig, getHistoryReWriteRuleList, isCssRequest } from './utils'
import { noflipToPlaceholder, cssjanus } from '../utils/rtl'
import { transformHandle, getMainjs } from './transform'
import { posthtmlViewBundle, getRtlOptions } from './generate-bundle'

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
    buildPagesDirectory: 'pages',
    cacheDirectory: '.posthtml-view-cache',
    usePlugins: null,
    rtl: false,
    minifyHtml: true,
    devMinifyHtml: false,
    minifyClassnames: false
  }, _opts || {})

  options.pagesDirectory = options.pagesDirectory || 'pages'
  options.buildPagesDirectory = options.buildPagesDirectory || options.pagesDirectory
  options.cacheDirectory = options.cacheDirectory || '.posthtml-view-cache'

  options.getOptions = (opts) => {
    options.styled = opts.styled
  }

  const pageCache: Map<string, string> = new Map()
  const chunkCache: Map<string, string> = new Map()
  const virtualId = 'virtual:posthtml-view'

  const rtl = getRtlOptions(options)

  const posthtmlViewPages: () => Plugin = () => {
    const name = 'view:posthtml-view-pages'

    let config: ResolvedConfig

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

      transformIndexHtml: {
        enforce: 'pre',
        async transform(html, ctx) {
          if (config.command === 'serve') {
            if (rtl && typeof rtl.devPreview === 'function' && rtl.devPreview(ctx.originalUrl)) {
              options.rtl = rtl

            } else {
              options.rtl = false
            }

          } else {
            options.rtl = rtl
          }

          return await transformHandle(
            config,
            options,
            virtualId,
            pageCache,
            chunkCache
          )(html, ctx)
        }
      },

      async resolveId(id, importer) {
        if (id === virtualId) {
          return id
        }

        if (/\?__posthtml_view__=(0|1)/g.test(id)) {
          return id
        }

        if (id.startsWith(virtualId)) {
          return id
        }

        return null
      },

      async load(id) {
        if (id === virtualId) {
          return ''
        }

        if (/\?__posthtml_view__=(0|1)/g.test(id)) {
          const mainid = getMainjs(id)
          const injectMain = id.includes('__posthtml_view__=1')

          let code = ''

          if (!injectMain) {
            // add module js
            code = code + `import '${mainid.replace(/\.(t|j)s/g, '')}';`
          }

          code = code + (pageCache.get(mainid) || '')

          return code
        }

        if (id.startsWith(virtualId)) {
          return chunkCache.get(id) || ''
        }

        return null
      },

      async transform(code, id) {
        if (config.command === 'build' && rtl && isCssRequest(id)) {
          // @see posthtmlViewBundle()
          return noflipToPlaceholder(code)
        }

        return null
      },
    }
  }

  const posthtmlViewDev: () => Plugin = () => {
    return {
      name: 'view:posthtml-view-dev',
      enforce: 'pre',
      apply: 'serve',

      configureServer(server) {
        const middlewares = server.middlewares

        middlewares.use(
          // @see https://github.com/vitejs/vite/blob/8733a83d291677b9aff9d7d78797ebb44196596e/packages/vite/src/node/server/index.ts#L433
          // @ts-ignore
          history({
            verbose: Boolean(process.env.DEBUG) && process.env.DEBUG !== 'false',
            disableDotRule: undefined,
            htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
            rewrites: getHistoryReWriteRuleList(options),
          })
        )

        // return () => {
        //   if (server.config.command === 'serve') {
        //     middlewares.use((req, res, next) => {
        //       console.log([req.url])

        //       // if (req.url && req.url.includes(virtualId)) {
        //       //   const id = req.url.replace('/@id/', '')

        //       //   if (chunkCache.get(id)) {
        //       //     res.end(chunkCache.get(id))
        //       //     return
        //       //   }
        //       // }

        //       next()
        //     })
        //   }
        // }
      },

      async transform(code, id) {
        // enforce: 'pre',
        // apply: 'serve',
        if (rtl && options.rtl && isCssRequest(id)) {
          return cssjanus(code, {
            transformDirInUrl: rtl.transformDirInUrl || false,
            transformEdgeInUrl: rtl.transformEdgeInUrl || false,
          })
        }

        return null
      },

      async handleHotUpdate({ file, server }) {
        if (
          file.includes('/' + options.mocksDirectory) || file.includes('.html')
        ) {
          server.ws.send({
            type: 'full-reload',
            path: '*',
          })
        }

        return []
      }
    }
  }

  return [
    posthtmlViewDev(),
    posthtmlViewPages(),
    posthtmlViewBundle(options, rtl)
  ]
}
