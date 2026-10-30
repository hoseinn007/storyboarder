const assert = require('assert')
const { chooseTopPlanDetails } = require('../../src/js/shot-generator/services/top-plan-details')
const topPlanLabel = require('../../src/js/models/top-plan-label')

describe('Top plan details', () => {
  afterEach(() => {
    const dialog = document.querySelector('[aria-label="Top plan details"]')
    if (dialog) dialog.querySelector('button').click()
  })
  it('requires every field and rejects whitespace names and invalid numbers', async () => {
    const result = chooseTopPlanDetails()
    const dialog = document.querySelector('[aria-label="Top plan details"]')
    const form = dialog.querySelector('form')
    const inputs = dialog.querySelectorAll('input, textarea, select')
    assert.strictEqual(inputs.length, 7)
    assert.strictEqual(form.checkValidity(), false)
    const enter = values => inputs.forEach((input, index) => {
      input.value = values[index]
      input.dispatchEvent(new Event('input'))
    })
    enter(['0', 'Kitchen', '1', 'Wide shot', 'Opening', 'Alice', 'static'])
    assert.strictEqual(form.checkValidity(), false)
    enter(['3', '   ', '1', 'Wide shot', 'Opening', 'Alice', 'static'])
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    assert(document.body.contains(dialog))
    assert.strictEqual(form.checkValidity(), false)
    enter(['3', ' Kitchen ', '2', ' Wide shot ', ' Opening ', ' Alice ', 'dynamic'])
    dialog.querySelector('[type="submit"]').click()
    const details = await result
    assert.deepStrictEqual(details, { sceneNumber: '3', sceneName: 'Kitchen', planNumber: '2', planName: 'Wide shot', description: 'Opening', characterName: 'Alice', planType: 'dynamic' })
    const plan = JSON.parse(JSON.stringify({ sg: { data: { topPlanDetails: details } } }))
    assert.strictEqual(topPlanLabel(plan, 0), 'Scene 3: Kitchen — Plan 2: Wide shot')
    assert(!document.body.contains(dialog))
  })
  it('preserves existing scene-only labels', () => {
    assert.strictEqual(topPlanLabel({ topPlanDetails: { sceneNumber: '3', sceneName: 'Kitchen' } }, 0), 'Scene 3: Kitchen')
  })
  it('cancels without providing details', async () => {
    const result = chooseTopPlanDetails()
    const dialog = document.querySelector('[aria-label="Top plan details"]')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.strictEqual(await result, null)
    assert(!document.body.contains(dialog))
  })
  it('uses the old label for existing plans', () => {
    assert.strictEqual(topPlanLabel({ uid: 'old' }, 1), 'Top plan 2')
  })
})
