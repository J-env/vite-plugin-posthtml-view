import path from 'path'
import fs from 'fs'
import { defineConfig } from 'vite'
import scss from 'sass'
import commonjsExternals from 'vite-plugin-commonjs-externals'
import windiCSS from 'vite-plugin-windicss'

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
        sourcemap: false,
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
          external: Object.keys({ ...dependencies }),
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
      open: '/index.html',
      port: 3001,
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
      windiCSS(),

      vitePluginPosthtmlView({
        includes: [],
        ignore: ['components'],
        pagesDirectory: 'example',
        buildPagesDirectory: 'pages',
        registerComponentsFile: '/example/_layout/global-components.html',
        // minifyHtml: false,
        php: {
          rename: false
        },
        styled: {},

        // rtl: {
        //   type: 'new-html'
        // },
        rtl: {
          type: 'syntax',
          syntax: '<?php if($rtl): ?>[[rtl]]<?php else: ?>[[ltr]]<?php endif; ?>'
        },

        minifyClassnames: true,
        devMinifyHtml: true,

        js: {
          type: 'ts'
        },
        stylePreprocessor: async (css) => {
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
