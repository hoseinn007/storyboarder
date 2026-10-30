const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/js/ar/src/index.js',
  output: {
    path: path.resolve(__dirname, './../../src/js/ar/dist'),
    filename: 'bundle.js'
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
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          // Creates `style` nodes from JS strings
          'style-loader',
          // Translates CSS into CommonJS
          'css-loader',
          // Compiles Sass to CSS
          'sass-loader',
        ],
      },
      {
        test: /\.glsl$/i,
        use: [
          'raw-loader'
        ],
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
    }),
    new HtmlWebpackPlugin({template: './src/js/ar/src/index.html'})
  ]
}
