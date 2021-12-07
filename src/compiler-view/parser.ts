import posthtml, { Node as Tree, RawNode, Plugin } from 'posthtml'
import expressions from 'posthtml-expressions'
import match from 'posthtml-match-helper'
import { render } from 'posthtml-render'
import { merge } from 'lodash'
import fse from 'fs-extra'

import type { ProcessOptions, ComponentMeta } from '../types'
import type { OptionsUtils } from './utils'

type Components = OptionsUtils['components']

export function parseTemplate(node: RawNode, component: ComponentMeta, options: OptionsUtils) {
  return function (tree: Tree) {
    const componentContent = node.content || []
    const slotNodes: Record<string, RawNode> = {}

    if (componentContent.length) {
      // name slot
      tree.match.call(componentContent, match('template'), (node) => {
        if (!node.attrs) return node
        if (!node.attrs.slot) return node

        slotNodes[node.attrs.slot] = node

        return node
      })
    }

    const _content = tree.match(match('slot'), (slot) => {
      const name = slot.attrs && slot.attrs.name || ''

      // default slot
      if (!name) {
        return mergeContent(slot.content, componentContent.filter(node => {
          return !(node['tag'] === 'template' && node['attrs'] && node['attrs']['slot'])
        }))
      }

      // name slot
      const slotNode = slotNodes[name]

      if (slotNode) {
        return mergeContent(slot.content, slotNode.content, getTemplateType(slotNode))
      }

      // default
      return slot.content || []
    })

    // @ts-ignore
    node.tag = false
    node.content = _content

    return tree
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

export function parseAttrsToLocals(
  locals: Record<string, any>,
  attrs: RawNode['attrs'],
  options: OptionsUtils
) {
  const $attrs = {}

  Object.entries(attrs || {}).forEach(([key, value]) => {
    // to js value
    $attrs[key] = transformValue(value)
  })

  const _locals = {
    [options.$attrs]: merge({}, options.locals, locals, $attrs)
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

let cacheComponents: Components

export async function parseGlobalComponents({
  registerComponentsFile,
  root,
  mode,
  encoding,
  prefix,
  join,
  slash
}: OptionsUtils): Promise<Components> {
  if (cacheComponents) return cacheComponents

  if (!registerComponentsFile) return {}

  const components: Components = {}
  const file = join(root, registerComponentsFile)

  const html = await fse.readFile(file, encoding)

  function matchComponents(tree: Tree) {
    tree.match(match(prefix('components')), (node) => {
      if (node.content) {
        node.content.forEach((element) => {
          if (typeof element === 'string') return

          let { src, ...locals } = element.attrs || {}

          if (element.tag && src) {
            src = join(file, src)

            components[element.tag] = {
              tag: element.tag,
              src: src,
              resolveId: slash(src),
              locals
            }
          }
        })
      }

      return node
    })
  }

  await posthtml([])
    .use(matchComponents)
    .process(html, {})

  // Production environments require caching
  if (mode !== 'development') {
    cacheComponents = components
  }

  return components
}
