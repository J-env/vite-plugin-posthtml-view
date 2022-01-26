import { Node as Tree } from 'posthtml';
import { OptionsUtils } from './utils';
export declare function parse(options: OptionsUtils): (tree: Tree) => Promise<Tree<string | void, void | import("posthtml").NodeAttributes>>;
