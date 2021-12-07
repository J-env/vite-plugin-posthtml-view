import type { Plugin } from 'vite'
import { createFilter } from '@rollup/pluginutils'
// import shell from 'shelljs'
import posthtml from 'posthtml'
import match from 'posthtml-match-helper'
import { minify, Options as MinifyOptions } from 'html-minifier-terser'

import { decryptHtml, htmlConversion } from '../utils/html'
import type { PluginOptions } from '../types'

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

export function posthtmlViewBundle(
  options: PluginOptions
): Plugin {
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

  const normalizeHtml = async (source: string) => {
    return (await posthtml([])
      .use(async (tree) => {
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
            head.content = [...head.content, ...content]

          } else {
            head.content = content
          }

          return head
        })

        return tree
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

    async generateBundle(_opts, outBundle) {
      // == remove css in js ========================
      // if (bundle.type === 'chunk' && bundle.fileName.includes('-legacy')) {
      // }

      for (const bundle of Object.values(outBundle)) {
        // == rtl css ========================
        if (
          bundle.type === 'asset' &&
          bundle.fileName.endsWith('.css') &&
          options.cssjanus
        ) {
          const rtlFileName = bundle.fileName.replace('.css', '.rtl.css')

          const rtlCss = cssjanus.transform(bundle.source, {
            transformDirInUrl: false,
            transformEdgeInUrl: false,
            ...(options.cssjanus as {})
          })

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

          if (options.buildPagesDirectory !== options.pagesDirectory) {
            const i = bundle.fileName.indexOf(options.pagesDirectory)

            if (i >= 0) {
              bundle.fileName = options.buildPagesDirectory
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

function stringSource(source: string | Uint8Array) {
  if (source instanceof Uint8Array) {
    return Buffer.from(source).toString('utf-8')
  }

  return source
}
