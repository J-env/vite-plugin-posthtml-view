import path from 'path';
import fg from 'fast-glob';
const cssReg = /\.(css|scss|less|sass|styl|stylus|pcss|postcss)$/;
export function isCssRequest(id) {
    const bool = cssReg.test(id);
    cssReg.lastIndex = 0;
    return bool;
}
export function getConfig(config, options) {
    config.build = config.build || {};
    config.build.rollupOptions = config.build.rollupOptions || {};
    config.build.ssr = false;
    const { input, pages } = getInputPages(config.root || process.cwd(), options);
    config.build.rollupOptions.input = input;
    config.server = config.server || {};
    if (config.server.open === true) {
        config.server.open = pages[0] && `/${pages[0].route || ''}` || '/';
    }
    return config;
}
export function getHistoryReWriteRuleList(options) {
    const list = [];
    const pages = getPagesOptions(options);
    pages.forEach((item) => {
        const to = `./${item.path}`;
        if (item.pageName === 'index') {
            list.push({
                from: /^\/$/,
                to,
            });
        }
        list.push({
            from: new RegExp(`^/${item.route}/*`),
            to,
        });
        list.push({
            from: new RegExp(`^/${item.route}$`),
            to,
        });
    });
    return list;
}
function getInputPages(root, options) {
    const pages = getPagesOptions(options);
    const input = {};
    pages.forEach((item) => {
        input[item.pageName] = path.resolve(root, item.path);
    });
    return { input, pages };
}
function getPagesOptions({ pagesDirectory, includes, ignore }) {
    includes = includes.filter(Boolean).map(item => item[0] === '/' ? item : ('/' + item));
    // { name: 'index.html', path: '${pagesDirectory}/index/index.html' }
    return fg.sync(`${pagesDirectory}/**/*.html`.replace('//', '/'), {
        objectMode: true,
        ignore: ignore.map(item => {
            return (item.includes('.') ? item : `**/${item}/**`).replace('//', '/');
        })
    })
        // 过滤 _ 开头的目录和文件
        .filter(item => {
        if (includes.some(f => item.path.includes(f))) {
            return true;
        }
        return !item.path.includes('/_');
    })
        .map(({ name, path }) => {
        // {
        //   filename: 'index.html',
        //   path: '${pagesDirectory}/index/index.html',
        //   route: 'index/index.html',
        //   pageName: 'index'
        // }
        // {
        //   filename: 'test.html',
        //   path: '${pagesDirectory}/index/test.html',
        //   route: 'index/test.html',
        //   pageName: 'index-test'
        // }
        const obj = {
            filename: name,
            path,
            route: '',
            pageName: '',
        };
        obj.route = path.replace(`${pagesDirectory}/`, '');
        obj.pageName = obj.route
            .replace(/(\/index)?\.html/, '')
            .replace('/', '-');
        return obj;
    });
}
//# sourceMappingURL=utils.js.map