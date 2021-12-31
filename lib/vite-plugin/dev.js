import path from 'path';
import fse from 'fs-extra';
import shell from 'shelljs';
export async function requireMock(tspath, hot = true) {
    let mock = null;
    if (tspath) {
        const isTs = shell.test('-f', tspath);
        const jspath = tspath.replace('.ts', '.js');
        const isJs = isTs || shell.test('-f', jspath);
        try {
            let raw = null;
            const clean = (url) => {
                if (hot && require && require.cache && !!require.cache[url]) {
                    delete require.cache[url];
                }
            };
            if (isTs) {
                clean(tspath);
                raw = require(tspath);
            }
            else if (isJs) {
                clean(jspath);
                raw = require(jspath);
            }
            if (raw) {
                mock = raw.__esModule ? raw.default : raw;
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    return mock || {};
}
const htmlCache = new Map();
export async function writeTemplate(html, root, cacheDirectory, file) {
    const filename = path.join(cacheDirectory, '.php-dev', file);
    if (htmlCache.get(file) !== html) {
        htmlCache.set(file, html);
        await fse.outputFile(path.resolve(root, filename), html, 'utf8');
    }
    return {
        tplFileName: filename,
        __views: ''
    };
}
//# sourceMappingURL=dev.js.map