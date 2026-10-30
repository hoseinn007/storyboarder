
const ReactRoot = require('../../utils/react-root')
const { ipcRenderer } = require('electron')
const { Suspense } = React = require('react')
const i18n = require('../../services/i18next.config')
const LanguagePreferences = require('../../language-preferences').default

ipcRenderer.on("languageChanged", (event, lng) => {
  i18n.changeLanguage(lng)
})

ReactRoot.render(
    <Suspense fallback="loading">
      <LanguagePreferences/>
    </Suspense>

  , document.getElementById("main")
  )
