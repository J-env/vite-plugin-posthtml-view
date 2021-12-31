import postcssSafeParser from 'postcss-safe-parser';
import postcssSelectorParser from 'postcss-selector-parser';
import { JSONStorage } from 'node-localstorage';
import { generateName, withoutEscape } from '../utils';
import { isDynamicSelector, dynamicReg } from '../compiler-view/utils';
let minify;
let classGenerator;
let idGenerator;
let jsonStorage;
const storage = {
    classesKey: '_classes',
    idsKey: '_ids',
    _classes: {},
    _ids: {},
    classes: {},
    ids: {},
};
const classes_map = {};
const ids_map = {};
function readCache(key, map) {
    try {
        const data = jsonStorage.getItem(key) || {};
        Object.keys(data).forEach((k) => {
            const v = data[k];
            map[v] = null;
        });
        return data;
    }
    catch (e) {
        return {};
    }
}
export async function writeCache() {
    if (jsonStorage) {
        jsonStorage.setItem(storage.classesKey, storage.classes);
        jsonStorage.setItem(storage.idsKey, storage.ids);
    }
}
export function createGenerator(_minify) {
    minify = minify || _minify;
    if (minify.__cache_file__ && !jsonStorage) {
        jsonStorage = new JSONStorage(minify.__cache_file__);
        storage._classes = readCache(storage.classesKey, classes_map);
        storage._ids = readCache(storage.idsKey, ids_map);
    }
    classGenerator = classGenerator || generateName(minify.generateNameFilters, minify.upperCase, (name) => classes_map[name] !== null);
    idGenerator = idGenerator || generateName(minify.generateNameFilters, minify.upperCase, (name) => ids_map[name] !== null);
}
export function minifyClassesHandle(css) {
    const ast = postcssSafeParser(css);
    function walkNodes(nodes) {
        nodes.forEach((rule) => {
            if (rule.type === 'atrule' &&
                (rule.name === 'media' || rule.name === 'supports')) {
                walkNodes(rule.nodes);
            }
            else {
                switch (rule.type) {
                    case 'rule':
                        rule.selector = selectorParser(rule.selector);
                        break;
                    default:
                        break;
                }
            }
        });
    }
    walkNodes(ast.nodes);
    return ast.toString();
}
function selectorParser(selector) {
    return postcssSelectorParser((selectorRoot) => {
        selectorRoot.walkClasses((node) => {
            if (isFiltered(node.value, false, false)) {
                return;
            }
            let value = node.value;
            let hasDynamic = false;
            const values = value.replace(dynamicReg, (s) => {
                hasDynamic = true;
                return ` ${s} `;
            });
            if (hasDynamic) {
                value = values
                    .split(/\s+/)
                    .map((val) => {
                    if (!val)
                        return '';
                    // checked dynamic string
                    if (isFiltered(val, false)) {
                        return val;
                    }
                    const v = addClassesValues(val);
                    return prefixValue(v) || val;
                })
                    .filter(Boolean)
                    .join('')
                    .trim();
                value = withoutEscape(value);
                node.setPropertyWithoutEscape('value', value);
                return;
            }
            node.setPropertyWithoutEscape('value', prefixValue(addClassesValues(value)) || value);
        });
        selectorRoot.walkIds((node) => {
            if (isFiltered(node.value, true)) {
                return;
            }
            node.value = prefixValue(addIdValues(node.value)) || node.value;
        });
    }).processSync(selector);
}
function addClassesValues(value) {
    const cacheValue = storage._classes[value];
    if (cacheValue) {
        classes_map[cacheValue] = null;
        storage.classes[value] = cacheValue;
        delete storage._classes[value];
        return cacheValue;
    }
    const preValue = storage.classes[value];
    if (preValue) {
        classes_map[preValue] = null;
        return preValue;
    }
    const v = classGenerator.next().value;
    classes_map[v] = null;
    storage.classes[value] = v;
    return v;
}
function addIdValues(value) {
    const cacheValue = storage._ids[value];
    if (cacheValue) {
        ids_map[cacheValue] = null;
        storage.ids[value] = cacheValue;
        delete storage._ids[value];
        return cacheValue;
    }
    const preValue = storage.ids[value];
    if (preValue) {
        ids_map[preValue] = null;
        return preValue;
    }
    const v = idGenerator.next().value;
    ids_map[v] = null;
    storage.ids[value] = v;
    return v;
}
function isFiltered(value, id, check) {
    if (check !== false && isDynamicSelector(value)) {
        return true;
    }
    value = (id ? '#' : '.') + value;
    return minify.filters.some(reg => {
        if (typeof reg === 'string') {
            return reg === value;
        }
        return reg.test(value);
    });
}
function prefixValue(value) {
    if (!value)
        return value;
    return minify.prefix + value;
}
export function htmlFor(id) {
    if (isFiltered(id, true)) {
        return;
    }
    const v = addIdValues(id);
    if (v) {
        return prefixValue(v);
    }
}
export function useTagId(href) {
    href = href.slice(1);
    if (isFiltered(href, true)) {
        return;
    }
    const val = storage.ids[href];
    if (val) {
        return '#' + prefixValue(val);
    }
}
const phpReg = /\\?%\\?}(.*?)\\?{\\?%/gs;
const phpReg2 = /\s+(\\?{\\?%)/g;
export function joinValues(values, id) {
    if (!values)
        return values;
    if (!id) {
        values = values.replace(dynamicReg, (s) => ` ${s} `);
    }
    values = values
        .split(/\s+/)
        .map((val) => {
        if (!val)
            return '';
        if (isFiltered(val, id)) {
            return val;
        }
        const v = !id ? addClassesValues(val) : addIdValues(val);
        return prefixValue(v) || val;
    })
        .filter(Boolean)
        .join(' ')
        .trim();
    if (!id) {
        values = values
            .replace(phpReg, (s, a) => {
            if (!a)
                return s;
            return s.replace(a, ` ${a.trim()} `);
        })
            .replace(phpReg2, '$1');
    }
    return values;
}
//# sourceMappingURL=classes.js.map