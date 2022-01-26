import type { Options, Components, RtlOptions } from '../types';
/**
 * @private
 */
export declare type OptionsUtils = Options & {
    /**
     * @private
     */
    join(from: string, src: string): string;
    /**
     * ensure the path is normalized in a way that is consistent inside
     * project (relative to root) and on different systems.
     * @private
     */
    slash(src: string, sl?: boolean): string;
    /**
     * @private
     */
    prefix(str: string): string;
    cssjanus(css: string): string;
    noflip(css: string): string;
    /**
     * @private
     */
    components: Components;
    rtl: false | RtlOptions;
};
export declare const alpineJsReg: RegExp;
export declare function hyphenate(str: string): string;
export declare function getTag(src: string): string;
export declare const dynamicReg: RegExp;
export declare function dynamicTest(css: string): boolean;
export declare function isDynamicSelector(s: string): boolean;
export declare function isFont(url: string): boolean;
export declare function isDynamicCss(css: string): boolean;
export declare function trimWhitespace(str: string): string;
export declare function trimAttrWhitespace(str: string, conservativeCollapse?: boolean): string;
export declare const htmlElements: string[];
export declare const svgElements: string[];
