import type { Plugin } from 'vite';
import type { PluginOptions, RtlOptions } from '../types';
export declare function getRtlOptions(options: PluginOptions): RtlOptions | false;
export declare function posthtmlViewBundle(options: PluginOptions, rtl: RtlOptions | false): Plugin;
