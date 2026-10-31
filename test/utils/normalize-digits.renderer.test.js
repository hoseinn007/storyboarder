const assert = require('assert')
const normalizeDigits = require('../../src/js/utils/normalize-digits')
require('../../src/js/window/normalize-digits-preload')

const insert = (input, text) => {
  input.focus()
  input.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true, cancelable: true, inputType: 'insertText', data: text
  }))
}

describe('localized numeric input', () => {
  let container
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => container.remove())

  it('normalizes both digit sets, mixed digits, decimals and signs', () => {
    assert.strictEqual(normalizeDigits('۰۱۲۳۴۵۶۷۸۹ ٠١٢٣٤٥٦٧٨٩ -۱2٫۵'), '0123456789 0123456789 -12.5')
    assert.strictEqual(normalizeDigits('پلان ۱۲'), 'پلان 12')
  })

  it('accepts typing and pasted digits before native number validation', () => {
    container.innerHTML = '<input type="number" min="1" step="0.01">'
    const input = container.firstChild
    let received
    input.addEventListener('input', () => { received = input.value })
    insert(input, '۱۲٫۵')
    assert.strictEqual(received, '12.5')
    input.select()
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', '٣٤٫٥')
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
    assert.strictEqual(received, '34.5')
    assert(input.checkValidity())
    input.select()
    insert(input, '۰')
    assert.strictEqual(input.value, '0')
    assert.strictEqual(input.checkValidity(), false)
  })

  it('submits Persian numbers from the top plan settings as English values', async () => {
    const { chooseTopPlanDetails } = require('../../src/js/shot-generator/services/top-plan-details')
    const result = chooseTopPlanDetails()
    const dialog = document.querySelector('[aria-label="Top plan details"]')
    const values = {
      'Scene number': '۱۲', 'Scene name': 'اتاق', 'Plan number': '۳',
      'Plan name': 'نما', Description: 'توضیح', 'Character name': 'علی',
      'Camera height (m)': '۱٫۷۵', 'Lens (mm)': '۳۵'
    }
    for (const [label, value] of Object.entries(values)) {
      const input = dialog.querySelector(`[aria-label="${label}"]`)
      if (input.type === 'number') insert(input, value)
      else input.value = value
    }
    assert(dialog.querySelector('form').checkValidity())
    dialog.querySelector('[type="submit"]').click()
    const details = await result
    assert.strictEqual(details.sceneNumber, '12')
    assert.strictEqual(details.planNumber, '3')
    assert.strictEqual(details.cameraHeight, '1.75')
    assert.strictEqual(details.lens, '35')
    assert.strictEqual(details.sceneName, 'اتاق')
  })

  it('preserves selection and delivers English digits to React controlled inputs', () => {
    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { flushSync } = require('react-dom')
    const root = createRoot(container)
    let received
    const Field = () => {
      const [value, setValue] = React.useState('1234')
      return React.createElement('input', { value, onChange: event => {
        received = event.target.value
        setValue(received)
      } })
    }
    flushSync(() => root.render(React.createElement(Field)))
    const input = container.firstChild
    input.focus()
    input.setSelectionRange(1, 3)
    insert(input, '۵۶')
    assert.strictEqual(received, '1564')
    assert.strictEqual(input.selectionStart, 3)
    flushSync(() => root.unmount())
  })

  it('normalizes textarea input before application listeners without changing Persian letters', () => {
    container.innerHTML = '<textarea></textarea>'
    const input = container.firstChild
    let received
    input.addEventListener('input', () => { received = input.value })
    input.value = 'پلان ۱۲'
    input.setSelectionRange(6, 6)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    assert.strictEqual(received, 'پلان 12')
    assert.strictEqual(input.selectionStart, 6)
  })
})
