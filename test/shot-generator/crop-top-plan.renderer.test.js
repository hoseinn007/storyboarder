const assert = require('assert')
const { chooseCrop, cropCanvas } = require('../../src/js/shot-generator/services/crop-top-plan')
describe('Top-plan crop', () => {
  const source = () => {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100
    const context = canvas.getContext('2d')
    context.fillStyle = 'red'; context.fillRect(0, 0, 50, 100)
    context.fillStyle = 'blue'; context.fillRect(50, 0, 50, 100)
    return canvas
  }
  it('waits for crop confirmation and returns normalized edges', async () => {
    const result = chooseCrop(source())
    const dialog = document.querySelector('[aria-label="Crop top plan"]')
    assert(dialog)
    const left = dialog.querySelector('[aria-label="Left crop edge"]')
    const stage = left.parentElement.parentElement
    const rect = stage.getBoundingClientRect()
    left.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: rect.left, clientY: rect.top }))
    document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: rect.left + rect.width / 4, clientY: rect.top }))
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }))
    Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Add top plan').click()
    assert.deepStrictEqual(await result, { x: .25, y: 0, width: .75, height: 1 })
    assert(!document.querySelector('[role="dialog"]'))
  })
  it('cancels without adding and resets trims', async () => {
    const result = chooseCrop(source())
    const dialog = document.querySelector('[role="dialog"]')
    const left = dialog.querySelector('[aria-label="Left crop edge"]')
    left.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Reset').click()
    assert.equal(dialog.querySelector('[aria-label="Crop selection"]').style.left, '0%')
    Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Cancel').click()
    assert.strictEqual(await result, null)
  })
  it('keeps edges inside the image and prevents an empty crop', async () => {
    const result = chooseCrop(source())
    const dialog = document.querySelector('[aria-label="Crop top plan"]')
    const left = dialog.querySelector('[aria-label="Left crop edge"]')
    for (let i = 0; i < 15; i++) left.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))
    Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Add top plan').click()
    const crop = await result
    assert.equal(crop.x, .98)
    assert(crop.width >= .019999)
    assert.equal(crop.x + crop.width, 1)
  })
  it('applies the same normalized crop to frame pixels at output resolution', async () => {
    const image = new Image()
    const loaded = new Promise(resolve => { image.onload = resolve })
    image.src = cropCanvas(source(), { x: .5, y: 0, width: .5, height: 1 }); await loaded
    const output = document.createElement('canvas'); output.width = 100; output.height = 100
    const context = output.getContext('2d'); context.drawImage(image, 0, 0)
    assert.deepStrictEqual(Array.from(context.getImageData(50, 50, 1, 1).data), [0, 0, 255, 255])
    assert.equal(image.width, 100)
  })
})
