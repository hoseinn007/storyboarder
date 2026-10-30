const path = require('path')
// via https://github.com/foliojs/fontkit/issues/67
const nodeExternals = require('webpack-node-externals')

module.exports = {
  entry: {
    'print-project': './src/js/windows/print-project/window.js'
  },
  target: 'electron-renderer',
  externals: [nodeExternals({
    allowlist: [/^@thi.ng/]
  })],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, './../../src/build'),
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        include: /node_modules[\\/]@thi\.ng[\\/]/,
        use: { loader: 'babel-loader', options: {
          presets: [['@babel/preset-env', { targets: { chrome: '79' } }]],
          plugins: [
            '@babel/plugin-proposal-class-properties',
            // This Electron bundle has process.env; Vite's import.meta.env
            // fallback in @thi.ng is unavailable and Webpack 4 cannot parse it.
            () => ({ visitor: { MetaProperty(metaPath) {
              if (metaPath.node.meta.name === 'import') {
                metaPath.replaceWithSourceString('({ env: undefined })')
              }
            } } })
          ]
        } }
      },
      { test: /\.mjs$/, type: 'javascript/auto' },
      {
        test: /\.(js)$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: { electron: require('electron/package.json').version }
                }
              ],
              '@babel/preset-react'
            ]
          }
        }
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  }
}
