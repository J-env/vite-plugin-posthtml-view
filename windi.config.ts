import { defineConfig } from 'windicss/helpers'

export default defineConfig({
  mode: 'jit',
  // preflight: false,
  darkMode: 'class',
  shortcuts: {},
  alias: {},
  extract: {
    include: [
      'example/**/*.html',
    ],
    exclude: [
      '**/*.md',
      '**/*.json',
      '.posthtml-view-cache/**/*',
      '.vscode/**/*',
      '.git/**/*',
      'dist/**/*',
      'src/**/*',
      'styles/**/*',
      'lib/**/*',
      'mocks/**/*',
      'node_modules/**/*',
      'public/**/*',
      'tests/**/*',
      'types/**/*',
    ],
  },
})
