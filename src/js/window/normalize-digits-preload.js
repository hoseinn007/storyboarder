const normalizeDigits = require('../utils/normalize-digits')

const isTextControl = target => target && (
  target.tagName === 'TEXTAREA' ||
  (target.tagName === 'INPUT' && ['text', 'number', 'search', 'tel', 'url', 'email'].includes(target.type))
)

// Run before Chromium rejects localized digits in native number inputs. Using
// insertText preserves the selection, undo history and native/React input events.
const insertNormalized = (event, text) => {
  if (!isTextControl(event.target) || event.target.disabled || event.target.readOnly || !text) return
  const normalized = normalizeDigits(text)
  if (normalized === text || !event.cancelable) return
  event.preventDefault()
  document.execCommand('insertText', false, normalized)
}

window.addEventListener('beforeinput', event => {
  if (!event.isComposing) insertNormalized(event, event.data)
}, true)
window.addEventListener('paste', event => {
  if (event.clipboardData) insertNormalized(event, event.clipboardData.getData('text/plain'))
}, true)

// Also handle completed IME input and input events from other editing methods,
// before application listeners read and parse the value.
window.addEventListener('input', event => {
  const target = event.target
  if (!isTextControl(target) || event.isComposing) return
  const normalized = normalizeDigits(target.value)
  if (normalized === target.value) return
  const start = target.selectionStart
  const end = target.selectionEnd
  const prototype = target.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(target, normalized)
  if (start !== null) target.setSelectionRange(start, end)
}, true)
