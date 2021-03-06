import { createCipheriv, createDecipheriv } from 'crypto'

const aesKey = '0123456789abcdef'
const markMap = {
  '=': '\\:',
  'php': '\\#',
  '\\:': '=',
  '\\#': 'php',
  ':': '=',
  '#': 'php'
}

const syntaxReg = /\\{\\@(\\:|\\#)(.*?)\\@\\}/gs
const syntaxReg2 = /{@(:|#)(.*?)@}/gs
const phpReg = /<\?(=|php)(.*?)\?>/gs
const emptyReg = /(\\@\\})=""/g

export function htmlConversion(html: string) {
  const _matchfn = function (_match, p1, p2) {
    const p = markMap[p1] || p1
    return `<?${p}${p2}?>`
  }

  return html.replace(syntaxReg, _matchfn)
    .replace(syntaxReg2, _matchfn)
}

/**
 * 加密 html
 * @desc /<\?(=|php)(.*?)\?>/gs ($2 => hash)
 * <?= $hello ?>
 * {@:hash@}
 * @param html
 */
export function encryptHtml(html: string) {
  return html.replace(phpReg, function (_match, p1, p2) {
    const p = markMap[p1] || p1
    // <?= $hello ?> to {@:加密的字符串@}
    return `\\{\\@${p}${aesEncrypt(p2, aesKey)}\\@\\}`
  })
}

/**
 * 把加密的解析出来, 方便压缩
 * @param html
 */
export function decryptHtml(html: string) {
  return html
    .replace(emptyReg, '$1')
    .replace(syntaxReg, function (_match, p1, p2) {
      return `\\{\\@${p1}${aesDecrypt(p2, aesKey)}\\@\\}`
    })
}

// AES 加密转换
function aesEncrypt(text: string, key: string) {
  const cipher = createCipheriv('aes128', key, key)

  let crypted = cipher.update(text, 'utf8', 'hex')
  crypted += cipher.final('hex')

  return crypted
}

// AES 解密转换
function aesDecrypt(text: string, key: string) {
  const cipher = createDecipheriv('aes128', key, key)

  let decrypted = cipher.update(text, 'hex', 'utf8')
  decrypted += cipher.final('utf8')

  return decrypted
}
