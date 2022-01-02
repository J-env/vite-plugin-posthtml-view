import type { Options as MinifyOptions } from 'html-minifier-terser'
import type { Node as Tree, PostHTML, Options as PostHtmlOptions } from 'posthtml'

type PostHTMLType = PostHTML<unknown, unknown>

export type PluginOptions = VitePluginOptions & Options

export interface VitePluginOptions {
  /**
   * 默认 以下划线(_) 开头的目录和文件_test/*, _test.html 是不会生成页面的
   * 需要保留以下划线(_) 开头的 目录和文件 ['_test.html']
   * @default []
   */
  includes: string[]

  /**
   * Ignore directories and files
   * @default []
   */
  ignore: string[]

  /**
   * Development environment pages directory
   * @default 'pages'
   */
  pagesDirectory: 'pages' | StringType

  /**
   * Development environment mocks directory
   * @default 'mocks'
   */
  mocksDirectory: 'mocks' | StringType

  /**
   * @default 'pages'
   */
  buildPagesDirectory: 'pages' | StringType

  /**
   * @default '.posthtml-view-cache'
   */
  cacheDirectory: '.posthtml-view-cache' | StringType

  /**
   * @default null
   */
  php?: {
    rename?: boolean

    devRender?: (params: {
      html: string
      options: VitePluginOptions & Options
    }) => Promise<string>
  }

  /**
   * rtl plugin
   * @default false
   */
  rtl: boolean | Partial<RtlOptions>

  minifyHtml: MinifyOptions | boolean | ((defaultOptions: MinifyOptions) => MinifyOptions | boolean)

  minifyHtmlAfter?: (html: string) => string

  /**
   * @default false
   */
  devMinifyHtml: boolean

  /**
   * Only used in production environments
   * @default false
   */
  minifyClassnames: Partial<MinifyClassnames> | boolean

  boolAttrs?: string[]

  /**
   * @default true
   */
  preloadCss: boolean

  /**
   * usePlugins(posthtml) => posthtml.use(plugins).use(plugins).use(plugins)
   * @default null
   */
  usePlugins: null | ((posthtml: PostHTMLType) => void)

  generateUsePlugins?: (tree: Tree) => Tree

  removeCssInJs?: (code: string) => string
}

export interface MinifyClassnames {
  /**
   * Ensure classnames build is consistent
   * @default true
   */
  enableCache: boolean

  /**
   * @default []
   */
  generateNameFilters: RegExp[]

  /**
   * @default true
   */
  upperCase: boolean

  /**
   * .js-click, #js-dom
   * @default [/^(\.|#)js-/, 'vite-legacy-polyfill', 'vite-legacy-entry']
   */
  filters: (RegExp | string)[]

  /**
   * @example ['x-transition']
   * ['js-class', 'x-transition']
   * @default []
   */
  attributes: (RegExp | string)[]

  /**
   * [/^([xv]-bind)?:class|^[xv]-data|^[xv]-scope/]
   */
  blurryAttrs: (RegExp | string)[]

  /**
   * @default ''
   */
  prefix: string

  /**
   * @private
   */
  __cache_file__: string
}

export type RtlOptions = CssjanusOptions & {
  /**
   * @default 'syntax'
   */
  type: 'new-html' | 'syntax'

  syntax: string

  devPreview: (originalUrl?: string) => boolean
}

export interface CssjanusOptions {
  transformDirInUrl?: boolean
  transformEdgeInUrl?: boolean
}

// PostHTML View
export interface Options {
  /**
   * @default process.cwd()
   */
  root: string

  /**
   * @default 'development'
   */
  mode: 'development' | 'production' | StringType

  htmlProcessor: ((html: string) => string) | null

  /**
   * @default 'utf8'
   */
  encoding: BufferEncoding

  /**
   * <div view:if=""></div>
   * @default 'view:'
   */
  viewPrefix: 'view:' | StringType

  /**
   * page file path
   * @require
   */
  from: string

  /**
   * registered components file
   * @default null
   */
  registerComponentsFile: string | null

  /**
   * css scss less ...
   */
  stylePreprocessor: StylePreprocessor

  /**
   * global default config
   * <style></style>
   */
  styled: Partial<StyledOptions>

  js: {
    type?: 'js' | 'ts'
    extract?: ExtractHandle
  }

  /**
   * @default all node.attrs
   */
  addClassIncludes?: string[]

  trimAttr?: (attr: string, value: string, trim: (str: string, conservativeCollapse?: boolean) => string) => string

  cumbersomeTrim?: (attr: string, value: string) => string

  assets: {
    /**
     * @example ['data-src', 'data-img']
     * @default ['data-src', 'data-img']
     */
    attributes: string[]

    /**
     * @default /^(?:x-|v-|:|@)/
     */
    attrRegExp: RegExp

    /**
     * @private
     */
    _include?: (file: string) => boolean
  }

  parser: ProcessOptions

  $attrs: '$attrs' | StringType

  plugins: any[]

  /**
   * @default {}
   */
  locals: Record<string, any>

  getOptions?: (options: Options) => void
}

export interface Directive {
  name: string | RegExp
  start: string
  end: string
}

export interface ProcessOptions extends PostHtmlOptions {
  directives?: Directive[]
}

export type ExtractHandle = (props: ExtractHandleProps) => void

interface ExtractHandleProps {
  type: 'js' | 'ts' | 'css' | StringType
  from: string
  resolveId: string
  scopedHash: string
  mainjs: string
  src?: string
  source?: string
}

// ==========================================================================
// ==================================================================
// ============ styles ==========================
export interface StyledOptions {
  /**
   * scoped <style scoped></style>
   * global <style global></style>
   *
   * @default 'scoped'
   */
  type: StyleType | StringType

  prefix: 'view-' | StringType

  /**
   * @default 'head'
   */
  to: StyleToSelector

  extract?: ExtractHandle
}

export type StylePreprocessor = (source: string) =>
  StylePreprocessorResults | Promise<StylePreprocessorResults>

export interface StylePreprocessorResults {
  code: string
}

export type StyleToSelector = '*' | 'file' | 'head'

export type StyleType = 'scoped' | 'global'

export type StringType = (string & {})

// ==========================================================================
// ==================================================================
// ============ components ==========================
export type Components = Record<ComponentMeta['tag'], ComponentMeta>

export interface ComponentMeta {
  /**
   * @example layout-base
   * @use <layout-base></layout-base>
   */
  tag: string

  /**
   * Component file path
   */
  src: string

  /**
   * parsed file path
   * Component unique identifier
   */
  resolveId: string

  /**
   * component default locals
   * @default {}
   */
  locals: Record<string, any>

  /**
   * Component's HTML code
   */
  source?: string | Promise<string>
}
