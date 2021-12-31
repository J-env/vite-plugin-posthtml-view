import type { UserConfig } from 'vite';
import type { Rewrite } from 'connect-history-api-fallback';
import type { PluginOptions as Options } from '../types';
export declare function isCssRequest(id: string): boolean;
export declare function getConfig(config: UserConfig, options: Options): UserConfig;
export declare function getHistoryReWriteRuleList(options: Options): Rewrite[];
