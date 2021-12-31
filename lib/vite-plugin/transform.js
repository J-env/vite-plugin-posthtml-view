import path from 'path';
import posthtml from 'posthtml';
import { encryptHtml, decryptHtml, htmlConversion } from '../utils/html';
import { compilerViewPlugin } from '../compiler-view';
import { requireMock, writeTemplate } from './dev';
import { phpRenderToHtml } from './php';
import { minifyHtml } from './html';
export function getMainjs(mainjs) {
    return mainjs.split('?__posthtml_view__=')[0];
}
export const transformHandle = (config, options, virtualId, pageCache, chunkCache) => {
    function getPageFile(filename) {
        const p = path.resolve(config.root, options.pagesDirectory);
        return path.relative(p, filename);
    }
    const isDev = config.command === 'serve';
    const noContent = `<div style="text-align:center;"><h1>posthtml-view</h1><p>No content</p></div>`;
    return async (html, ctx) => {
        const file = getPageFile(ctx.filename);
        // 1. php to hash
        if (options.php) {
            html = encryptHtml(html);
        }
        const processor = posthtml([
            compilerViewPlugin({
                ...options,
                from: ctx.filename,
                htmlProcessor(html) {
                    return encryptHtml(html);
                },
                styled: {
                    ...options.styled,
                    extract: (meta) => {
                        // {
                        //   type: 'css',
                        //   from: '${projectRoot}/example/view/index.html',
                        //   resolveId: 'example/view/components/style-js/index.html',
                        //   scopedHash: 'view-cnxw0a',
                        //   mainjs: '/example/view/index.ts?__posthtml_view__=0',
                        //   source: '.style-js.view-cnxw0a{padding-left:20px;color:red;font-size:40px}'
                        // }
                        const mainjs = getMainjs(meta.mainjs);
                        const css_src = `${virtualId}/${meta.resolveId.replace('.html', `.css`)}`;
                        const import_css = `import '${css_src}';`;
                        chunkCache.set(css_src, meta.source || '');
                        const prev_source = pageCache.get(mainjs) || '';
                        if (!prev_source.includes(css_src)) {
                            pageCache.set(mainjs, prev_source + import_css);
                        }
                    }
                },
                js: {
                    ...options.js,
                    extract: (meta) => {
                        // {
                        //   type: 'ts',
                        //   from: '${projectRoot}/example/view/index.html',
                        //   resolveId: 'example/view/components/style-js/index.html',
                        //   scopedHash: 'view-cnxw0a',
                        //   mainjs: '/example/view/index.ts?__posthtml_view__=0',
                        //   source: '',
                        //   src: 'example/view/components/style-js/index'
                        // }
                        const mainjs = getMainjs(meta.mainjs);
                        if (meta.src) {
                            const prev_source = pageCache.get(mainjs) || '';
                            const import_js = `import '${meta.src}';`;
                            if (!prev_source.includes(meta.src)) {
                                pageCache.set(mainjs, prev_source + import_js);
                            }
                        }
                        else {
                            const js_src = `${virtualId}/${meta.resolveId.replace('.html', '')}`;
                            const import_js = `import '${js_src}';`;
                            chunkCache.set(js_src, meta.source || '');
                            const prev_source = pageCache.get(mainjs) || '';
                            if (!prev_source.includes(js_src)) {
                                pageCache.set(mainjs, prev_source + import_js);
                            }
                        }
                    }
                }
            }),
            ...(options.plugins || [])
        ]);
        if (typeof options.usePlugins === 'function') {
            options.usePlugins(processor);
        }
        // 2.
        html = (await processor.process(html, {
            directives: [
                { name: '!DOCTYPE', start: '<', end: '>' },
                { name: '?php', start: '<', end: '>' },
                { name: '?=', start: '<', end: '>' },
            ],
            ...options.parser,
            sync: false
        })).html.trim();
        // dev server
        if (isDev) {
            if (options.php) {
                // hash to php
                html = decryptHtml(html);
                if (options.devMinifyHtml) {
                    html = await minifyHtml(html, options);
                }
                html = htmlConversion(html);
                if (typeof options.php.devRender === 'function') {
                    html = await options.php.devRender({
                        html,
                        options
                    });
                }
                else {
                    const mockPath = path.join(config.root, options.mocksDirectory, file.replace('.html', '.ts'));
                    const [mock, { tplFileName, __views }] = await Promise.all([
                        requireMock(mockPath, true),
                        writeTemplate(html, config.root, options.cacheDirectory, file)
                    ]);
                    html = await phpRenderToHtml(tplFileName, {
                        __views: __views,
                        ...mock
                    });
                }
                return html || noContent;
            }
            else {
                if (options.devMinifyHtml) {
                    html = await minifyHtml(html, options);
                }
            }
        }
        // build
        return html;
    };
};
//# sourceMappingURL=transform.js.map