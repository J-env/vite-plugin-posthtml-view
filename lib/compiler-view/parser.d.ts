import posthtml, { Node as Tree, RawNode, Plugin } from 'posthtml';
import type { ProcessOptions, ComponentMeta } from '../types';
import type { OptionsUtils } from './utils';
declare type Components = OptionsUtils['components'];
export declare function parseTemplate(node: RawNode, component: ComponentMeta, options: OptionsUtils): (tree: Tree) => posthtml.Node<string | void, void | posthtml.NodeAttributes>;
export declare function processWithPostHtml(options: ProcessOptions, plugins: Plugin<any>[], content: any, prepend?: Plugin<any>[]): Promise<posthtml.Node<string | void, void | posthtml.NodeAttributes>>;
export declare function parseAttrsToLocals(locals: Record<string, any>, attrs: RawNode['attrs'], options: OptionsUtils): any;
export declare function transformValue(value: void | string): any;
export declare function parseGlobalComponents({ registerComponentsFile, root, mode, encoding, prefix, join, slash }: OptionsUtils): Promise<Components>;
export {};
