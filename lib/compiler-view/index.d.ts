import type { Node as Tree } from 'posthtml';
import type { Options } from '../types';
export declare function compilerViewPlugin(_options: Partial<Options>): (tree: Tree) => Promise<Tree<string | void, void | import("posthtml").NodeAttributes>>;
