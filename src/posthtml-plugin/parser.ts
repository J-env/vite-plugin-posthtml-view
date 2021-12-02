import posthtml, { Node as Tree, RawNode, Plugin } from 'posthtml'
import { merge } from 'lodash'
import { render } from 'posthtml-render'
import expressions from 'posthtml-expressions'
import match from 'posthtml-match-helper'

import { ViewComponent } from './view'
import { Options, ProcessOptions } from '../types'

/**
 * @desc 对读取的组件文件 html 内容进行
 * attrs 传入
 * @param componentNode 匹配的组件标签及后代节点内容
 * @param options
 * @returns
 */
export function parseContent(componentNode: RawNode, view: ViewComponent, options: Options) {
  // content (组件文件 html 内容)
  return function (content: string) {
    return processWithPostHtml(
      options.parser,
      options.plugins,
      content,
      [
        parseAttrsToLocals(view.locals, componentNode.attrs, options.$attrs)
      ]
    )
  }
}

export function parseTemplate(componentNode: RawNode, view: ViewComponent, options: Options) {
  // tree (组件文件 html 内容解析后的节点树)
  return function (tree: Tree) {
    // 匹配 component slot 插槽内容
    const componentContent = componentNode.content || []
    const slotNodes: Record<string, RawNode> = {}

    // wrapper 在使用组件的地方查找具名插槽
    if (componentContent.length) {
      tree.match.call(componentContent, match('template'), (node) => {
        if (!node.attrs) return node
        if (!node.attrs.slot) return node

        slotNodes[node.attrs.slot] = node

        return node
      })
    }

    // 匹配 slot插槽节点
    const _content = tree.match(match('slot'), (slot) => {
      const name = slot.attrs && slot.attrs.name || ''

      // 默认插槽
      if (!name) {
        return mergeContent(slot.content, componentContent.filter(node => {
          return !(node['tag'] === 'template' && node['attrs'] && node['attrs']['slot'])
        }))
      }

      // 具名插槽
      const slotNode = slotNodes[name]

      if (slotNode) {
        return mergeContent(slot.content, slotNode.content, getTemplateType(slotNode))
      }

      // 默认内容
      return slot.content || []
    })

    // @ts-ignore
    componentNode.tag = false
    componentNode.content = _content
  }
}

function mergeContent(slotContent, templateContent, type?: TemplateType) {
  slotContent = Array.isArray(slotContent) ? slotContent : [slotContent || '']
  templateContent = Array.isArray(templateContent) ? templateContent : [templateContent || '']

  switch (type) {
    case 'replace':
      slotContent = templateContent
      break

    case 'prepend':
      slotContent = [...templateContent, ...slotContent]
      break

    case 'append':
      slotContent = [...slotContent, ...templateContent]
      break

    default:
      slotContent = (templateContent as []).filter(Boolean).length === 0
        ? slotContent
        : templateContent
      break
  }

  return slotContent
}

type TemplateType = 'replace' | 'prepend' | 'append'

function getTemplateType(templateNode: RawNode): TemplateType {
  let blockType = (templateNode.attrs && templateNode.attrs.type || '')

  if (!['replace', 'prepend', 'append'].includes(blockType)) {
    blockType = 'replace'
  }

  return blockType as TemplateType
}

export function processWithPostHtml(
  options: ProcessOptions,
  plugins: Plugin<any>[],
  content: any,
  prepend?: Plugin<any>[]
) {
  return posthtml((prepend || []).concat(plugins))
    .process(render(content), options)
    .then(result => result.tree)
}

export function parseAttrsToLocals(locals: Record<string, any>, attrs: RawNode['attrs'], attrKey: string) {
  const $attrs = {}

  Object.entries(attrs || {}).forEach(([key, value]) => {
    // 转换成 js value
    $attrs[key] = transformValue(value)
  })

  const _locals = {
    [attrKey]: merge(locals, $attrs)
  }

  return expressions({ locals: _locals })
}

export function transformValue(value: void | string) {
  try {
    return new Function(`return ${value}`)()

  } catch (err) {
    return value
  }
}
