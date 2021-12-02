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
   * 忽略某些目录和文件生成页面
   * @default []
   */
  ignore: string[]

  /**
   * 开发环境 页面目录
   * @default 'pages'
   */
  pagesDirectory: 'pages' | StringType

  /**
   * 开发环境 页面目录
   * @default 'mocks'
   */
  mocksDirectory: 'mocks' | StringType

  /**
   * 构建后的 html 页面目录
   * @default 'pages'
   */
  distPagesDirectory: 'pages' | StringType

  /**
   * @default {}
   */
  php?: {
    rename?: boolean

    devRender?: (params: {
      html: string
      options: VitePluginOptions & Options
    }) => Promise<string>
  }

  cssjanus: {
    transformDirInUrl: boolean

    transformEdgeInUrl: boolean
  }

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
   * 项目根目录
   * @default process.cwd()
   */
  root: string

  /**
   * @default 'development'
   */
  mode: 'development' | 'production' | StringType

  /**
   * @default 'utf8'
   */
  encoding: BufferEncoding

  /**
   * 缓存目录
   * @default '.posthtml-view-cache'
   */
  cacheDirectory: '.posthtml-view-cache' | StringType

  /**
   * <div view:if=""></div>
   * @default 'view:'
   */
  viewPrefix: 'view:' | StringType

  /**
   * 当前渲染的页面路径
   * @require
   */
  from: string

  /**
   * css scss less ...
   */
  stylePreprocessor: StylePreprocessor

  /**
   * 注册全局组件
   * global registered components
   * @default {}
   */
  components: Components

  /**
   * 样式处理 全局配置
   * global default config
   * <style></style>
   */
  styled: Partial<StyledOptions>

  js: {
    extract?: ExtractHandle
  }

  // assets: {}

  devCssDiv: string | null

  parser: ProcessOptions

  $attrs: '$attrs' | StringType

  plugins: any[]

  /**
   * 全局变量
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
  type: 'js' | 'ts' | 'css'
  from: string
  componentName: string
  main: string
  src?: string
  source?: string
}

// ==========================================================================
// ==================================================================
// ============ styles ==========================
export interface StyledOptions {
  /**
   * module <style module></style>
   * scoped <style scoped></style>
   * global <style global></style>
   *
   * components
   * dynamic <style dynamic></style>
   * ssr <style ssr></style>
   * @default 'module'
   */
  type: StyleType | String

  /**
   * @default 'css'
   */
  lang: CssLang

  rtl: boolean

  /**
   * @default 'head'
   */
  to: StyleToSelector

  removeDataStyledAttr: boolean

  /**
   * <div x-transition:enter="$m.class-name"></div>
   * <style>.class-name{}</style>
   * @example ['x-transition:enter', 'x-transition:leave']
   * @default []
   */
  customAttributes: string[]

  extract?: ExtractHandle

  /**
   *
   * @default false production
   * @default true development
   */
  displayName: boolean

  /**
   * 自定义生成类名
   * 默认内部生成简短类名 generateName()
   * @default null
   */
  classNameSlug: ClassNameSlugFn | null
}

export type CssLang = 'css' | 'scss' | 'less' | 'sass' | 'styl' | 'stylus'

export type StylePreprocessor = (
  source: string,
  lang: CssLang
) => StylePreprocessorResults | Promise<StylePreprocessorResults>

export interface StylePreprocessorResults {
  code: string
}

export type StyleToSelector = '*' | 'file' | 'head' | StringType

export type StyleType = 'module' | 'scoped' | 'global'

export type StyleTypeAll = StyleType | 'dynamic'

export type StringType = (string & {})

export type ClassNameSlugType = string

export type ClassNameSlugFn = (
  hash: string,
  title: string,
  type: StyleTypeAll
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
   * 组件局部默认变量
   * @default {}
   */
  locals?: Record<string, any>

  /**
   * Component's HTML code
   */
  source?: string | Promise<string>
}
