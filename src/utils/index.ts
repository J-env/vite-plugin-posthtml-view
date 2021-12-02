import { createHash } from 'crypto'

export function getContentHash(content: string, start?: number, end?: number): string {
  const hash = createHash('sha256').update(Buffer.from(content)).digest('hex')

  if (!end || end <= 0) {
    return hash
  }

  return hash.slice(start || 0, end || 8)
}

export function toValidCSSIdentifier(s: string) {
  return s.replace(/[^-_a-z0-9\u00A0-\uFFFF]/gi, '_').replace(/^\d/, '_')
}

/**
 * @desc generate name a, b, ... A, B, ... ac, ab, ...
 * function* [es6 generator]
 * @example const g = generateName([], false); g.next().value;
 */
export function* generateName(filters: RegExp[] = [], upperCase: boolean = true) {
  let abc = 'abcdefghijklmnopqrstuvwxyz'

  if (upperCase) {
    abc = abc + abc.toUpperCase()
  }

  const digital = '0123456789'
  const str = abc + digital

  const abc_len = abc.length
  const str_len = str.length

  filters = [...(filters || []), /ad/i]

  let i = 0
  let num = 0

  while (true) {
    let base = abc_len
    let name = ''

    do {
      name = name + str.charAt(num % base)
      num = Math.floor(num / base)
      base = str_len

    } while (num > 0)

    if (!filters.some(reg => reg.test(name))) {
      yield name
    }

    i++
    num = i
  }
}
