const { createRoot } = require('react-dom/client')

// The main window refreshes several independent widgets. Reuse each root so
// updates preserve component state and subscriptions.
const roots = new WeakMap()

const render = (element, container) => {
  let root = roots.get(container)
  if (!root) {
    root = createRoot(container)
    roots.set(container, root)
  }
  root.render(element)
}

const unmount = container => {
  const root = roots.get(container)
  if (!root) return
  root.unmount()
  roots.delete(container)
}

module.exports = { render, unmount }
