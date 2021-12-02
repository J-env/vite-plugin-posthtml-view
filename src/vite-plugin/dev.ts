import path from 'path'
import fse from 'fs-extra'
import shell from 'shelljs'

import { getContentHash } from '../utils'

export async function requireMock(tspath: string, hot: boolean = true) {
  let mock: null | Record<string, any> = null

  if (tspath) {
    const isTs = shell.test('-f', tspath)

    const jspath = tspath.replace('.ts', '.js')
    const isJs = isTs || shell.test('-f', jspath)

    try {
      let raw: any = null

      const clean = (url: string) => {
        if (hot && require && require.cache && !!require.cache[url]) {
          delete require.cache[url]
        }
      }

      if (isTs) {
        clean(tspath)
        raw = require(tspath)

      } else if (isJs) {
        clean(jspath)
        raw = require(jspath)
      }

      if (raw) {
        mock = raw.__esModule ? raw.default : raw
      }

    } catch (e) {
      console.error(e)
    }
  }

  return mock || {}
}

const hashCache = new Map<string, string>()

export async function writeTemplate(
  html: string,
  root: string,
  cacheDirectory: string,
  file: string,
) {
  const filename = path.join(cacheDirectory, '.php-dev', file)

  const hash = getContentHash(html)

  if (hashCache.get(file) !== hash) {
    hashCache.set(file, hash)

    await fse.outputFile(path.resolve(root, filename), html, 'utf8')
  }

  return {
    tplFileName: filename,
    __views: ''
  }
}
