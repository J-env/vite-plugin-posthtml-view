const overrideBrowserslist = [
  '>15%',
  'last 15 versions',
  'Firefox ESR',
  'not ie < 10'
]

const autoprefixer = {
  overrideBrowserslist,
  flexbox: true,
  // grid: 'autoplace'
}

module.exports = {
  plugins: {
    'autoprefixer': autoprefixer,
    'postcss-flexbugs-fixes': {},
    'postcss-preset-env': {
      overrideBrowserslist,
      autoprefixer,
      stage: 3,
      features: {
        'custom-properties': false,
      },
    }
  },
}
