import path from 'path';
import circular from 'circular';
import execa from 'execa';
export async function phpRenderToHtml(filename, input) {
    const { __views, ...rest } = input;
    const model = rest;
    model._TEMPLATE = filename;
    model._REGISTER_GLOBAL_MODEL = true;
    model._VIEWS_PATH = __views;
    // stringify
    const json = JSON.stringify(model, circular());
    // e.g. php loader.php <<< '["array entry", "another", "etc"]'
    const { stdout } = await execa('php', [path.join(__dirname, '/loader.php')], {
        input: json
    });
    return stdout;
}
//# sourceMappingURL=php.js.map