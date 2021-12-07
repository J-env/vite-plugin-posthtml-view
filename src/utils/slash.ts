/**
 * @see https://github.com/sindresorhus/slash#readme
 */
export function slash(path: string): string {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path)

  const hasNonAscii = /[^\u0000-\u0080]+/.test(path)

  if (isExtendedLengthPath || hasNonAscii) {
    return path
  }

  return path.replace(/\\/g, '/')
}
