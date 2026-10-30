const path = require('path')
const webpack = require('webpack')

module.exports = {
  entry: './src/js/windows/shot-explorer/window.js',
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, './../../src/build'),
    filename: 'shot-explorer.js'
  },
  module: {
    rules: [
      { test: /\.mjs$/, type: 'javascript/auto' },
      {
        // Webpack 4 cannot parse PeerJS private class fields.
        test: /\.m?js$/,
        include: path.dirname(require.resolve('peerjs/package.json')),
        type: 'javascript/auto',
        use: { loader: 'babel-loader', options: {
          presets: [['@babel/preset-env', { targets: { chrome: '79' } }]],
          plugins: ['@babel/plugin-proposal-class-properties']
        } }
      },
      {
        test: /\.(js|jsx)$/,
        exclude: /(node_modules|bower_components)/,
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
            ],
            plugins: ['@babel/plugin-proposal-class-properties']
          }
        }
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  plugins: [
    new webpack.ProvidePlugin({
      'THREE': 'three'
    })
  ]
}
