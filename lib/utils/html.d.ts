export declare function htmlConversion(html: string): string;
/**
 * 加密 html
 * @desc /<\?(=|php)(.*?)\?>/gs ($2 => hash)
 * <?= $hello ?>
 * {%:hash%}
 * @param html
 */
export declare function encryptHtml(html: string): string;
/**
 * 把加密的解析出来, 方便压缩
 * @param html
 */
export declare function decryptHtml(html: string): string;
