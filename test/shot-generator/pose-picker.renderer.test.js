/* global describe it beforeEach afterEach */
require('@babel/register')({ presets: ['@babel/preset-env', '@babel/preset-react'] })
const assert = require('assert')
const React = require('react')
const ReactDOM = require('react-dom')
const { act, Simulate } = require('react-dom/test-utils')
const PosePicker = require('../../src/js/shot-generator/components/PosePicker').default
const { filterPoses } = require('../../src/js/shot-generator/components/PosePicker')
const presets = [
  { id: 'a', name: 'Sitting', keywords: 'phone relaxed' },
  { id: 'b', name: 'Standing', keywords: 'waiting' },
  { id: 'c', name: 'Walking', keywords: 'phone street' }
]
const Item = ({ data }) => React.createElement('div', { className: 'test-pose', 'data-id': data.id }, data.name)

describe('expanded pose picker (renderer)', () => {
  let root, style, closes
  beforeEach(() => {
    closes = 0
    root = document.createElement('div'); document.body.appendChild(root)
    style = document.createElement('style')
    style.textContent = '.pose-picker__gallery {width:744px;height:420px;overflow-y:auto} .pose-picker {width:800px;height:600px}'
    document.head.appendChild(style)
    act(() => { ReactDOM.render(React.createElement(PosePicker, {
      presets, ItemComponent: Item, itemData: {}, onClose: () => closes++
    }), root) })
  })
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(root) })
    root.remove(); style.remove()
  })
  it('opens a separate gallery and searches names and keywords together', () => {
    assert(document.body.querySelector('[role="dialog"][aria-label="Choose a pose"]'))
    assert.equal(document.querySelectorAll('.test-pose').length, 3)
    const input = document.querySelector('[aria-label="Search poses"]')
    act(() => Simulate.change(input, { target: { value: 'SITTING phone' } }))
    assert.equal(document.querySelectorAll('.test-pose').length, 1)
    assert.equal(document.querySelector('.test-pose').dataset.id, 'a')
    act(() => Simulate.change(input, { target: { value: 'no such pose' } }))
    assert(document.body.textContent.includes('No poses match your search.'))
    act(() => Simulate.change(input, { target: { value: '' } }))
    assert.equal(document.querySelectorAll('.test-pose').length, 3)
  })
  it('supports Close, Escape, and keyboard focus containment', () => {
    const input = document.querySelector('[aria-label="Search poses"]')
    input.focus()
    act(() => Simulate.keyDown(input, { key: 'Tab' }))
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Close pose browser')
    act(() => Simulate.keyDown(input, { key: 'Escape' }))
    assert.equal(closes, 1)
    act(() => Simulate.click(document.querySelector('[aria-label="Close pose browser"]')))
    assert.equal(closes, 2)
  })
  it('returns all poses for whitespace and supports keyword-only matches', () => {
    assert.equal(filterPoses(presets, '   ').length, 3)
    assert.deepEqual(filterPoses(presets, 'relaxed').map(preset => preset.id), ['a'])
  })
})
