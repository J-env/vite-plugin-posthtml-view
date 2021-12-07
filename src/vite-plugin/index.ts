import path from 'path'
import type { Plugin, ResolvedConfig } from 'vite'
import history from 'connect-history-api-fallback'
import { merge } from 'lodash'

import type { VitePluginOptions, PluginOptions } from '../types'
import { getConfig, getHistoryReWriteRuleList } from './utils'
import { slash } from '../utils/slash'
import { transformHandle } from './transform'
import { posthtmlViewBundle } from './generate-bundle'

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
    usePlugins: null,
    cssjanus: false,
    minifyHtml: true
  }, _opts || {})

  options.pagesDirectory = options.pagesDirectory || 'pages'
  options.buildPagesDirectory = options.buildPagesDirectory || options.pagesDirectory

  options.getOptions = (opts) => {
    options.cacheDirectory = opts.cacheDirectory || '.posthtml-view-cache'
    options.styled = opts.styled
  }

  const pageCache: Map<string, string> = new Map()
  const chunkCache: Map<string, string> = new Map()
  const virtualId = 'virtual:posthtml-view'

  const posthtmlViewPages: () => Plugin = () => {
    const name = 'view:posthtml-view-pages'

    let config: ResolvedConfig

    let pageId = ''

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
          pageId = slash(path.normalize(path.relative(config.root, ctx.filename)))
            .replace('.html', '_posthtml-view-js')

          // console.log([ctx.filename], 'ctx')

          return await transformHandle(
            config,
            options,
            pageId,
            virtualId,
            pageCache,
            chunkCache
          )(html, ctx)
        }
      },

      async resolveId(id, importer) {
        // console.log([id, importer], 'resolveId')

        if (id === virtualId) {
          // console.log([
          //   importer,
          //   this.getModuleInfo(importer || id),
          //   id,
          // ])
        }

        if (id === virtualId) {

          // console.log([id], 'virtualId')
          return `${virtualId}/${pageId}`
        }

        if (id.startsWith(virtualId)) {
          // console.log([id], 'resolveId')
          return id
        }

        return null
      },

      async load(id) {
        if (id === virtualId) {
          // console.log([id], 'load virtualId')
          return ''
        }

        if (id === `${virtualId}/${pageId}`) {
          // console.log([id, pageCache, pageCache.get(pageId), pageId], 'pageId')
          return pageCache.get(pageId) || ''
        }

        if (id.startsWith(virtualId)) {
          // console.log([id], 'chunkCache')
          return chunkCache.get(id) || ''
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
      },
    }
  }

  return [
    posthtmlViewPages(),
    posthtmlViewBundle(options)
  ]
}
