import type { Options as MinifyOptions } from 'html-minifier-terser'
import type { PostHTML, Options as PostHtmlOptions } from 'posthtml'

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
  rtl: ({
    transformDirInUrl?: boolean
    transformEdgeInUrl?: boolean
  }) | boolean

  minifyHtml: MinifyOptions | boolean

  /**
   * usePlugins(posthtml) => posthtml.use(plugins).use(plugins).use(plugins)
   * @default null
   */
  usePlugins: null | ((posthtml: PostHTMLType) => void)
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
   * @default '.posthtml-view-cache'
   */
  cacheDirectory: '.posthtml-view-cache' | StringType

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

  // assets: {}

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

  /**
   * Custom generated class name
   * @default null
   */
  classNameSlug: ClassNameSlugFn | null
}

export type StylePreprocessor = (source: string) =>
  StylePreprocessorResults | Promise<StylePreprocessorResults>

export interface StylePreprocessorResults {
  code: string
}

export type StyleToSelector = '*' | 'file' | 'head'

export type StyleType = 'scoped' | 'global'

export type StringType = (string & {})

export type ClassNameSlugType = string

export type ClassNameSlugFn = (
  slug: string,
  className: string,
  type: StyleType
) => string

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
