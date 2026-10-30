const path = require('path')
const webpack = require('webpack')

module.exports = {
  entry: './src/js/windows/shot-generator/window.js',
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, './../../src/build'),
    filename: 'shot-generator.js'
  },
  module: {
    rules: [
      { test: /\.mjs$/, type: 'javascript/auto' },
      {
        // Lower PeerJS private fields for Webpack 4 using installed Babel.
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
        exclude: /node_modules\/(?!(electron-redux)\/).*/,
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
            plugins: [
              '@babel/plugin-proposal-class-properties',
              '@babel/plugin-proposal-optional-chaining'
            ]
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
  ],
  externals: {
    uws: "uws",
    // These packages locate executable files at runtime.
    'ffmpeg-static': 'commonjs ffmpeg-static',
    execa: 'commonjs execa',
    pdfkit: 'commonjs pdfkit'
  },
  resolve: {
    alias: {
      'events': 'node_modules/events/index.js'
    }
  }
}
