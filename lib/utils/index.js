import { createHash } from 'crypto';
export function getContentHash(content, start, end) {
    const hash = createHash('sha256').update(Buffer.from(content)).digest('hex');
    if (!end || end <= 0) {
        return hash;
    }
    return hash.slice(start || 0, end || 8);
}
export const validCSSReg = /[^-_a-z0-9\u00A0-\uFFFF]/gi;
export const startsWithNumberReg = /^\d/;
export function toValidCSSIdentifier(s, l) {
    if (!s)
        return s;
    return s.replace(validCSSReg, l || '_').replace(startsWithNumberReg, l || '_');
}
export const externalRE = /^(https?:)?\/\//;
export const isExternalUrl = (url) => externalRE.test(url);
export const dataUrlRE = /^\s*data:/i;
export const isDataUrl = (url) => dataUrlRE.test(url);
const withoutEscapeReg = /({|%|:|})/g;
export function withoutEscape(val) {
    return val.replace(withoutEscapeReg, '\\$1');
}
/**
 * @desc generate name a, b, ... A, B, ... ac, ab, ...
 * function* [es6 generator]
 * @example const g = generateName([], false); g.next().value;
 */
export function* generateName(filters = [], upperCase = true, returnCallback) {
    returnCallback = returnCallback || ((_) => true);
    let abc = 'abcdefghijklmnopqrstuvwxyz';
    if (upperCase) {
        abc = abc + abc.toUpperCase();
    }
    const digital = '0123456789';
    const str = abc + digital;
    const abc_len = abc.length;
    const str_len = str.length;
    filters = [...(filters || []), /ad/i];
    let i = 0;
    let num = 0;
    while (true) {
        let base = abc_len;
        let name = '';
        do {
            name = name + str.charAt(num % base);
            // num = Math.floor(num / base)
            num = ~~(num / base);
            base = str_len;
        } while (num > 0);
        if (!filters.some(reg => reg.test(name)) && returnCallback(name)) {
            yield name;
        }
        i++;
        num = i;
    }
}
//# sourceMappingURL=index.js.map