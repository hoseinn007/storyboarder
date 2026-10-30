import React from "react"
import ReactRoot from '../../utils/react-root'
import {Provider} from 'react-redux'

import store from './helpers/store'

import App from "./components/App"
import './index.scss'


ReactRoot.render(
  <Provider store={store}>
    <App/>
  </Provider>,
  document.getElementById('root')
)
