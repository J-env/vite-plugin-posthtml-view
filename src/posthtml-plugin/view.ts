import path from 'path'
import fse from 'fs-extra'

import postcss, { Result } from 'postcss'
import type Processor from 'postcss/lib/processor'
import postcssrc, { Result as PostcssrcResult } from 'postcss-load-config'
import type { Node as Tree, RawNode } from 'posthtml'
import match from 'posthtml-match-helper'

import { parseContent, parseTemplate } from './parser'
import { htmlElements, getTag } from './utils'
import { slugify } from '../utils/slugify'
import { postcssParser } from './css'
import {
  Options,
  ComponentMeta,
  StyleTypeAll,
  StyledOptions,
  CssLang,
  StyleToSelector,
  ExtractHandle
} from '../types'

interface StyleAttrs extends Record<Partial<StyleTypeAll>, string | boolean> {
  lang: CssLang
  to: StyleToSelector
}

interface Mapx {
  selector?: '*' | 'file' | (string & {})
  position?: 'prepend' | 'append' | (string & {})
  hash?: string
  id: string
}

let postcssrc_sync: PostcssrcResult
let processor: Processor

const getPostcssConfigSync = () => {
  try {
    postcssrc_sync = postcssrc_sync || postcssrc.sync()

  } catch (e) {
    postcssrc_sync = {
      file: '',
      options: {},
      plugins: []
    }
  }

  processor = processor || postcss(postcssrc_sync.plugins)
}

export function parse(options: Options) {
  let rootView: ViewComponent

  function parseHandle(options: Options, parent?: ViewComponent | null) {
    const view = new ViewComponent(options)

    if (parent === null) {
      rootView = view
      rootView.isRoot = true
    }

    view.root = rootView
    view.parent = parent || null

    return function (tree: Tree) {
      const promises: Promise<any>[] = []

      view.matchRegisterComponents(tree)
      view.matchComponent(tree)

      tree.walk((node) => {
        if (typeof node === 'string') {
          // @TODO 去除多余的空格
          return node
        }

        if (!node.tag) return node

        const tag = node.tag
        const attrs = node.attrs || {}
        const component = view.getComponent(attrs, tag)

        if (component) {
          if (htmlElements.includes(component.tag)) {
            throw new Error(`The component <${tag}> is the HTML tag`)
          }

          const source = component.source
          const src = component.src || ''

          Object.assign(view.locals, component.locals)

          const p = view.readFile(source, src)
            // 1.根据组件标签及路径解析对应的文件内容
            .then(view.parseContent(node))
            // 2.解析组件样式
            .then((tree) => view.parseStylesAndJs(tree, node, src))
            // 3.递归调用parse 解析组件中其他组件引用
            .then((tree) => {
              return parseHandle({
                ...options,
                from: path.join(path.dirname(options.from), src)
              }, view)(tree)
            })
            // 4.解析插槽
            .then(view.parseTemplate(node))

          promises.push(p)
        }

        return node
      })

      if (parent === null) {
        promises.push(rootView.parseStylesAndJs(tree, null, options.from))
      }

      return Promise.all(promises).then(() => {
        // Collect the CSS
        if (parent === null) {
          return rootView.collectStyles(tree)
        }

        return tree
      })
    }
  }

  return parseHandle(options, null)
}

export class ViewComponent {
  options: Options
  components: Options['components'] = {}
  locals: Record<string, any>
  isRoot: boolean = false

  componentName!: string

  scopedHash!: string
  scopedClasses: Record<string, boolean> = {}

  hasModuleClasses!: boolean
  moduleClasses: Record<string, string> = {}

  hasDynamicClasses!: boolean
  dynamicClasses: Record<string, string> = {}

  root!: ViewComponent
  parent: ViewComponent | null = null
  childs: Record<string, ViewComponent> = {}

  get children() {
    return this.childs
  }

  constructor(options: Options) {
    this.options = options
    this.locals = { ...options.locals }
  }

  parseContent(node: RawNode) {
    return parseContent(node, this, this.options)
  }

  parseStylesAndJs(tree: Tree, componentNode: RawNode | null, componentSrc: string) {
    getPostcssConfigSync()

    const {
      stylePreprocessor,
      root,
      from,
      styled: optionStyled
    } = this.options

    const cssPreprocessor = (css: string, lang: StyleAttrs['lang']) => {
      return Promise.resolve(stylePreprocessor(css, lang))
    }

    this.componentName = componentNode
      ? (componentNode.tag as string)
      : from.replace(root, '').replace(/\/+/g, '-')

    const promises: Promise<any>[] = []

    tree.match(match('style'), (node) => {
      const attrs: StyleAttrs = (node.attrs as any) || ({})
      const styled = normalizeStyled(optionStyled, attrs)

      const content = String(node.content || '').trim()

      if (attrs['src']) {
        let src = attrs['src'] as string

        src = path.join(path.isAbsolute(src) ? root : path.dirname(componentSrc), src)

        // @ts-ignore
        styled.lang = path.extname(src).replace('.', '')

        const p = this.readFile(undefined, src)
          .then((css) => {
            if (css) {
              return cssPreprocessor(content, styled.lang)
                .then((result) => {
                  if (result && result.code) {
                    if (styled.type === 'global') {
                      node.content = [result.code]

                    } else {
                      const ast = postcssParser(result.code, this, styled)

                      node.content = [ast.css]
                    }

                  } else {
                    node.content = [content]
                  }
                })
            }
          })

        delete attrs['src']

        promises.push(p)

      } else {
        if (content) {
          const p = cssPreprocessor(content, styled.lang)
            .then((result) => {
              if (result && result.code) {
                if (styled.type === 'global') {
                  node.content = [result.code]

                } else {
                  const ast = postcssParser(result.code, this, styled)

                  node.content = [ast.css]
                }

              } else {
                node.content = [content]
              }
            })

          promises.push(p)
        }
      }

      node.attrs = node.attrs || {}

      node.attrs['data-component-css-id'] = this.componentName

      return node
    })

    tree.match(match('script'), (node) => {
      node.attrs = (node.attrs || {})

      let src = node.attrs.src

      if (src && /^(https?:)?\/\//.test(src)) {
        return node
      }

      node.attrs['data-component-js-id'] = this.componentName

      if (src) {
        src = path.join(path.isAbsolute(src) ? root : path.dirname(componentSrc), src)

        node.attrs.src = path.join(path.isAbsolute(src) ? root : path.dirname(from), src)
      }

      return node
    })

    tree.walk((node) => {
      if (node.tag) {
        promises.push(Promise.resolve(node).then((node) => {
          return this.collectClassNames(node)
        }))
      }

      // 行内样式
      if (node.attrs && node.attrs.style) {
        const p = processor.process(node.attrs.style, { ...postcssrc_sync.options, from: from || undefined })
          .then(result => {
            node.attrs && (node.attrs.style = result.css)
          })

        promises.push(p)
      }

      // clean
      promises.push(
        Promise.resolve()
          .then(() => {
            node.attrs && Object.entries(node.attrs).forEach(([key, value]) => {
              if (['null', 'undefined'].includes(value as string)) {
                delete node.attrs[key]
              }
            })
          })
      )

      return node
    })

    return Promise.all(promises).then(() => tree)
  }

  collectClassNames(node: RawNode) {
    if (!node.tag) return

    node.attrs = node.attrs || {}
    const customAttributes = this.options.styled.customAttributes || []

    if (this.scopedHash) {
      const classNames = getClass(node.attrs.class)

      // css 中使用的节点
      if (this.scopedClasses[node.tag] || classNames.some(c => this.scopedClasses[c])) {
        node.attrs.class = classNames.concat(this.scopedHash).join(' ')
      }
    }

    const moduleAttr = this.prefix('module')
    const dynamicAttr = this.prefix('dynamic')

    if (this.hasModuleClasses) {
      normalizeClassNames(node.attrs, '$m.', moduleAttr, this.moduleClasses)
    }

    if (this.hasDynamicClasses) {
      normalizeClassNames(node.attrs, '$d.', dynamicAttr, this.dynamicClasses)
    }

    if (!node.attrs.class) {
      delete node.attrs.class
    }

    delete node.attrs[moduleAttr]
    delete node.attrs[dynamicAttr]

    if (customAttributes.length) {
      Object.entries(node.attrs).forEach(([key, value]) => {
        if (key === 'class') return

        if (customAttributes.some(item => key.includes(item))) {
          node.attrs[key] = getClass(value).map(s => {
            if (s.includes('$m.')) {
              const hash = this.moduleClasses[s.replace('$m', '')]
              return hash || s
            }

            if (s.includes('$d.')) {
              const hash = this.dynamicClasses[s.replace('$d', '')]
              return hash || s
            }

            return s
          })
        }
      })
    }
  }

  parseTemplate(node: RawNode) {
    return parseTemplate(node, this, this.options)
  }

  // 收集 css
  collectStyles(tree: Tree) {
    const cache = new Map<string, Mapx>()
    const { devCssDiv, styled, mode, from, js, root } = this.options

    if (devCssDiv) {
      tree.match(match('body'), function (node) {
        const cssContainer = {
          tag: 'div',
          attrs: {
            id: devCssDiv,
            style: 'display: none !important;'
          },
        }

        if (Array.isArray(node.content)) {
          // @ts-ignore
          node.content.unshift(cssContainer)
        } else {
          // @ts-ignore
          node.content = [cssContainer]
        }

        return node
      })
    }

    tree.match(match('style'), function (node) {
      const content = String(node.content || '').trim()

      node.attrs = (node.attrs || {})

      // 有内容，且去重
      if (content && !cache.has(content)) {
        cache.set(content, {} as any)

        const selector = node.attrs.to || (devCssDiv ? ('#' + devCssDiv) : styled.to) || 'head'

        // 不做处理, 就在在当前位置
        if (node.attrs.to === '*') {
          delete node.attrs.to
          return node
        }

        const id = node.attrs['data-component-css-id'] || ''

        cache.set(content, {
          selector: selector,
          position: node.attrs.index || 'append',
          id: id,
          hash: slugify(id + content),
        })
      }

      node.tag = false as any
      delete node.content

      return node
    })

    const jsFromHtmlFile = this.root.options.from
    const jsCache = new Map<string, null>()

    const jsExtract: ExtractHandle = (obj) => {
      if (js && typeof js.extract === 'function') {
        js.extract(obj)
      }
    }

    const getJsModuleEnter: () => string = () => {
      let src = ''

      // 先获取页面第一个 script 入口
      tree.match(match('script[type="module"]'), (node) => {
        if (!src && node.attrs && node.attrs.src) {
          src = node.attrs.src
        }

        return node
      })

      // 没有页面入口 添加一个虚拟的入口
      if (!src && Array.isArray(tree)) {
        src = genFilename(jsFromHtmlFile.replace(root, ''))

        let push = true

        tree.match(match('script[type="module"]'), (node) => {
          if (node.attrs && node.attrs.src === src) {
            push = false
          }

          return node
        })

        push && tree.push({
          tag: 'script',
          attrs: {
            type: 'module',
            src: src
          }
        })
      }

      return src
    }

    tree.match(match('script[data-component-js-id]'), function (node) {
      node.attrs = (node.attrs || {})

      const id = node.attrs['data-component-js-id'] || ''
      const src = node.attrs.src || undefined
      const content = (src ? null : String(node.content || '').trim()) || undefined
      const ext = src && path.extname(src).replace('.', '')

      if (id && !jsCache.has(id)) {
        jsCache.set(id, null)

        jsExtract({
          type: ext === 'ts' ? 'ts' : 'js',
          from: jsFromHtmlFile,
          componentName: id,
          main: getJsModuleEnter(),
          source: content,
          src: src
        })
      }

      node.tag = false as any
      delete node.content

      return node
    })

    const invalidSelector = new Set<string>()
    const headStyleId = ''
    const attrIdKey = 'data-posthtml-view-styled'
    const isDev = mode === 'development'

    cache.forEach(({ selector, position, hash, id }, content) => {
      if (!selector) return

      if (
        (selector === 'file' || styled.to === 'file') &&
        typeof styled.extract === 'function'
      ) {
        styled.extract({
          type: 'css',
          from: this.root.options.from,
          componentName: id || '',
          main: getJsModuleEnter(),
          source: content,
          // src: ''
        })

        return
      }

      invalidSelector.add(selector)

      tree.match(match(selector), function (node) {
        invalidSelector.delete(selector)

        switch (node.tag) {
          case 'head':
            const styled: any = node.content && node.content.find(item => {
              if (!item || typeof item === 'string') {
                return false
              }

              // @todo: 字节大小
              return item.tag === 'style' && item.attrs && item.attrs[attrIdKey] === headStyleId
            })

            if (styled) {
              styled.content = generateCssContent(styled.content, content, position)

            } else {
              const element: any = {
                tag: 'style',
                attrs: { [attrIdKey]: headStyleId },
                content: content
              }

              if (node.content) {
                node.content[position === 'prepend' ? 'unshift' : 'push'](element)

              } else {
                node.content = [element]
              }
            }
            break;

          case 'style':
            node.content = [generateCssContent(node.content as any, content, position)]
            break;

          default:
            const element: any = {
              tag: 'style',
              attrs: isDev ? { '__development_data-css-id': id } : undefined,
              content: content
            }

            if (node.content) {
              node.content[position === 'prepend' ? 'unshift' : 'push'](element)

            } else {
              node.content = [element]
            }


            break;
        }

        return node
      })
    })

    const promises: Promise<void | Result>[] = []

    getPostcssConfigSync()

    // 最后收集css 交给 postcss 处理
    tree.match(match('style'), function (node) {
      if (styled.removeDataStyledAttr && node.attrs && node.attrs[attrIdKey]) {
        delete node.attrs[attrIdKey]
      }

      const styles = String(node.content || '').trim()

      if (styles) {
        const _from = (from || tree.options && tree.options['from']) || undefined

        promises.push(
          processor.process(styles, { ...postcssrc_sync.options, from: _from })
            .then(result => {
              node.content = [result.css]
            })
        )
      }

      if (node.attrs) {
        delete node.attrs['global']
        delete node.attrs['ssr']
        delete node.attrs['scoped']
        delete node.attrs['dynamic']
        delete node.attrs['module']
      }

      return node
    })

    invalidSelector.forEach((value) => {
      throw Error('Invalid selector: ' + value)
    })

    return Promise.all(promises).then(() => tree)
  }

  readFile(source: ComponentMeta['source'], src: ComponentMeta['src']) {
    if (source != null) {
      return Promise.resolve(source)
    }

    const { root, from, encoding } = this.options

    const filePath = path.join(path.isAbsolute(src) ? root : path.dirname(from), src)

    return fse.readFile(filePath, encoding)
  }

  getComponent(attrs, tag: string): ComponentMeta | undefined {
    // <test-component view:query="global"></test-component>
    // warning <test-component view:query="parents"></test-component>
    // <test-component view:query="parent"></test-component>
    const view_query: 'global' | 'parents' | 'parent' | (string & {}) = attrs[this.prefix('query')] || ''

    // 查找当前作用域组件 然后查找全局组件
    switch (view_query) {
      case 'parent':
        return this.parent ? this.parent.components[tag] : undefined

      case 'parents':
        return this.queryParents(this.parent, tag) || this.options.components[tag]

      case 'global':
        return this.options.components[tag]

      default:
        return this.components[tag] || this.options.components[tag]
    }
  }

  matchRegisterComponents(tree: Tree) {
    // <view:components>
    //   <view:register tag="tag-name" src="src"></view:register>
    //   <view:register tag="tag-name" src="src"></view:register>
    // </view:components>
    tree.match(match(this.prefix('components')), (node) => {
      tree.match.call(node, match(this.prefix('register')), (register) => {
        const { tag, src } = register.attrs || {}

        if (tag && src) {
          this.components[tag] = {
            tag: tag,
            src: src,
            locals: {},
          }
        }

        return register
      })

      // @ts-ignore
      node.tag = false
      delete node.content

      return node
    })
  }

  matchComponent(tree: Tree) {
    // 1. <view:component src="src" {...attrs}></view:component>
    tree.match(match(this.prefix('component')), (node) => {
      const attrs = node.attrs || {}

      let remove = false

      if (attrs.src) {
        // { tag: 'view:component', attrs: { src: 'src' } }
        const tag = 'view-src-' + getTag(attrs.src)

        this.components[tag] = {
          tag: tag,
          src: attrs.src,
          locals: {}
        }

        node.tag = tag
        delete attrs.src

      } else {
        remove = true
      }

      if (remove) {
        // @ts-ignore
        node.tag = false
        delete node.content
      }

      return node
    })
  }

  prefix(str: string) {
    return `${this.options.viewPrefix}${str}`
  }

  queryParents(parent: ViewComponent['parent'], tag: string) {
    if (!parent) return
    if (!parent.components) return

    let componentMeta

    while (parent && parent.components) {
      componentMeta = parent.components[tag]

      if (componentMeta) return componentMeta

      parent = parent.parent
    }

    return componentMeta
  }
}

function getClass(str: any): string[] {
  return (str || '').trim().split(/\s+/).filter(Boolean)
}

function genFilename(src: string) {
  return src.replace('.html', '.ts?__posthtml_view__')
}

function normalizeClassNames(
  attrs: Record<string, any>,
  prefix: string,
  quick: string,
  classes: Record<string, string>
) {
  let classNames = getClass(attrs.class)

  // <div view:module="className"></div>
  // <div class="${prefix}.className"></div>
  const moduleAttr = quick

  if (classNames.length) {
    classNames = classNames.map(item => {
      if (item.includes(prefix)) {
        const hash = classes[item.replace(prefix, '')]
        return hash || ''
      }

      return item
    })
  }

  if (attrs[moduleAttr]) {
    getClass(attrs[moduleAttr]).forEach(item => {
      const hash = classes[item]

      if (hash && !classNames.includes(hash)) {
        classNames.push(hash)
      }
    })
  }

  attrs.class = classNames.filter(Boolean).join(' ')
}

function normalizeStyled(styled: Partial<StyledOptions>, attrs: StyleAttrs): StyledOptions {
  // {
  //   type: 'module',
  //   lang: 'css',
  //   to: 'head',
  // }
  styled = { ...styled }

  styled.lang = attrs.lang || styled.lang || 'css'
  styled.to = attrs.to || styled.to || 'head'

  if (attrs.module != null) {
    styled.type = 'module'

  } else if (attrs.scoped != null) {
    styled.type = 'scoped'

  } else if (attrs.global != null) {
    styled.type = 'global'

  } else if (attrs.dynamic != null) {
    styled.type = 'dynamic'
  }

  return styled as StyledOptions
}

function generateCssContent(arr: string | string[] | undefined, css: string, index: Mapx['position']) {
  arr = (typeof arr === 'string' ? [arr] : arr) || []

  switch (index) {
    case 'prepend':
      arr.unshift(css)
      break;

    case 'append':
    default:
      arr.push(css)
      break;
  }

  return arr.filter(Boolean).join('')
}
