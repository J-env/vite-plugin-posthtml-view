import path from 'path'
import fse from 'fs-extra'
import shell from 'shelljs'

export async function requireMock(jspath: string, originalUrl: string, hot: boolean = true) {
  let mock: null | Record<string, any> = null

  if (shell.test('-f', jspath)) {
    try {
      let raw: any = null

      const clean = (url: string) => {
        if (hot && require && require.cache && !!require.cache[url]) {
          delete require.cache[url]
        }
      }

      clean(jspath)
      raw = require(jspath)

      if (raw) {
        raw = raw.__esModule ? raw.default : raw

        if (typeof raw === 'function') {
          mock = raw(originalUrl)

        } else {
          mock = raw
        }
      }

    } catch (e) {
      console.error(e)
    }
  }

  return mock || {}
}

const htmlCache = new Map<string, string>()

export async function writeTemplate(
  html: string,
  root: string,
  cacheDirectory: string,
  file: string,
) {
  const filename = path.join(cacheDirectory, '.php-dev', file)

  if (htmlCache.get(file) !== html) {
    htmlCache.set(file, html)

    await fse.outputFile(path.resolve(root, filename), html, 'utf8')
  }

  return {
    tplFileName: filename,
    __views: ''
  }
}
