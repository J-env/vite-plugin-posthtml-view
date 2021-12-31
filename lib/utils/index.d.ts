export declare function getContentHash(content: string, start?: number, end?: number): string;
export declare const validCSSReg: RegExp;
export declare const startsWithNumberReg: RegExp;
export declare function toValidCSSIdentifier(s: string, l?: string): string;
export declare const externalRE: RegExp;
export declare const isExternalUrl: (url: string) => boolean;
export declare const dataUrlRE: RegExp;
export declare const isDataUrl: (url: string) => boolean;
export declare function withoutEscape(val: string): string;
/**
 * @desc generate name a, b, ... A, B, ... ac, ab, ...
 * function* [es6 generator]
 * @example const g = generateName([], false); g.next().value;
 */
export declare function generateName(filters?: RegExp[], upperCase?: boolean, returnCallback?: (name: string) => boolean): Generator<string, string, unknown>;
