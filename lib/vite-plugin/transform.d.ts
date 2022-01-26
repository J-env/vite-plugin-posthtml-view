import type { ResolvedConfig, IndexHtmlTransformHook } from 'vite';
import type { PluginOptions } from '../types';
declare type Handle = (config: ResolvedConfig, options: PluginOptions, virtualId: string, pageCache: Map<string, string>, chunkCache: Map<string, string>) => IndexHtmlTransformHook;
export declare function getMainjs(mainjs: string): string;
export declare const transformHandle: Handle;
export {};
