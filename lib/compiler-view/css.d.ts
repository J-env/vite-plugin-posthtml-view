import { OptionsUtils } from './utils';
export interface ScopedClasses {
    classNames: string[];
    tags: Record<string, boolean>;
    assetsCache: Set<string>;
}
export declare const cssUrlRE: RegExp;
export declare const cssImageSetRE: RegExp;
export declare function postcssScopedParser(css: string, resolveId: string, options: OptionsUtils, from: string, start_mark: string, end_mark: string, global?: boolean): {
    scopedHash: string;
    scopedClasses: ScopedClasses;
    css: string;
};
export declare function urlReplace(input: string, re: RegExp, replacer: (match: RegExpExecArray) => string): string;
interface ImageCandidate {
    url: string;
    descriptor: string;
}
export declare function processSrcSet(srcs: string, replacer: (arg: ImageCandidate) => string): string;
export {};
