import path from 'path'
import circular from 'circular'
import execa from 'execa'

// types
interface Input extends Record<string, any> {
  __views: string
}

interface ModelProps extends Record<string, any> {
  _TEMPLATE?: string
  _REGISTER_GLOBAL_MODEL?: boolean
  _VIEWS_PATH?: string
}

export async function phpRenderToHtml(filename: string, input: Input): Promise<string> {
  const { __views, ...rest } = input

  const model: ModelProps = rest

  model._TEMPLATE = filename

  model._REGISTER_GLOBAL_MODEL = true

  model._VIEWS_PATH = __views

  // stringify
  const json = JSON.stringify(model, circular())

  // e.g. php loader.php <<< '["array entry", "another", "etc"]'
  const { stdout } = await execa('php', [path.join(__dirname, '/loader.php')], {
    input: json
  })

  return stdout
}
