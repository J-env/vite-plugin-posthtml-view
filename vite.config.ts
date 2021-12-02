import path from 'path'
import fs from 'fs'
import { defineConfig } from 'vite'
import scss from 'sass'
import commonjsExternals from 'vite-plugin-commonjs-externals'

import { dependencies } from './package.json'

import { vitePluginPosthtmlView } from './src'

export default defineConfig(async (env) => {
  if (env.command === 'build' && env.mode !== 'example') {
    return {
      plugins: [
        commonjsExternals({
          externals: ['path', 'fs', 'crypto']
        }),
        {
          name: '_project:generateBundle',
          enforce: 'post',
          apply: 'build',

          async generateBundle() {
            this.emitFile({
              type: 'asset',
              fileName: 'loader.php',
              source: fs.readFileSync(
                path.resolve(__dirname, 'src/vite-plugin/loader.php'),
                'utf-8'
              )
            })

            this.emitFile({
              type: 'asset',
              fileName: 'posthtml-view.json',
              source: fs.readFileSync(
                path.resolve(__dirname, 'posthtml-view.json'),
                'utf-8'
              )
            })
          }
        }
      ],
      build: {
        outDir: 'lib',
        target: 'esnext',
        minify: true,
        lib: {
          entry: path.resolve(__dirname, 'src/index.ts'),
          name: 'posthtmlView',
          formats: ['es', 'umd'],
          fileName: 'index'
        },
        terserOptions: {
          compress: {
            keep_infinity: true,
            drop_console: true,
          },
        },
        rollupOptions: {
          // 确保外部化处理那些你不想打包进库的依赖
          external: Object.keys(dependencies),
        }
      }
    }
  }

  // ======================================
  // posthtml-view pages example
  const preprocessorOptions = {
    scss: {
      additionalData: '@import "styles/variables.scss";'
    }
  }

  return {
    server: {
      open: '/view/index.html'
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    css: {
      preprocessorOptions
    },
    plugins: [
      vitePluginPosthtmlView({
        includes: [],
        ignore: ['components'],
        pagesDirectory: 'example',
        distPagesDirectory: 'pages',
        components: {
          'layout-base': {
            tag: 'layout-base',
            src: '/example/_layout/base.html'
          },
          'my-button': {
            tag: 'my-button',
            src: '/example/components/button.html'
          }
        },
        // minifyHtml: false,
        styled: {
          lang: 'scss'
        },
        stylePreprocessor: async (css, lang) => {
          if (lang === 'scss') {
            const output = scss.renderSync({
              data: preprocessorOptions.scss.additionalData + '\n' + css,
              includePaths: ['node_modules'],
              outputStyle: 'compressed',
              // importer: [],
            })

            return {
              code: output.css.toString()
            }
          }

          return {
            code: css
          }
        }
      })
    ],
    build: {
      manifest: true,
      // minify: 'terser',
      terserOptions: {
        compress: {
          keep_infinity: true,
          drop_console: true,
        },
      },
    }
  }
})
