import path from 'path';
export function joinPath(root, rootFrom, from, src) {
    return path.join(path.isAbsolute(src) ? root : path.dirname(from || rootFrom), src);
}
export function slashPath(root, src, sl) {
    src = slash(path.normalize(path.relative(root, src)));
    return sl ? (src[0] === '/' ? src : `/${src}`) : src;
}
/**
 * @see https://github.com/sindresorhus/slash#readme
 */
export function slash(path) {
    const isExtendedLengthPath = /^\\\\\?\\/.test(path);
    const hasNonAscii = /[^\u0000-\u0080]+/.test(path);
    if (isExtendedLengthPath || hasNonAscii) {
        return path;
    }
    return path.replace(/\\/g, '/');
}
//# sourceMappingURL=slash.js.map