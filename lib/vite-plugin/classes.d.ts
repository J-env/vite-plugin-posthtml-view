import type { MinifyClassnames } from '../types';
export declare function writeCache(): Promise<void>;
export declare function createGenerator(_minify: MinifyClassnames): void;
export declare function minifyClassesHandle(css: string): string;
export declare function htmlFor(id: string): any;
export declare function useTagId(href: string): string | undefined;
export declare function joinValues(values: string, id?: boolean, filter?: (val: string) => boolean): string;
