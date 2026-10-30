const assert = require('assert')
const TopPlansTimeline = require('../../src/js/window/top-plans-timeline')
describe('Top Plans Timeline view', () => {
  let root, view, scene, changed
  beforeEach(() => {
    root = document.createElement('div')
    root.innerHTML = '<div id="storyboarder-sketch-pane"></div><div id="playback"></div>'
    document.body.appendChild(root)
    changed = 0
    scene = { defaultBoardTiming: 2000, boards: [{ uid: 'camera' }], topPlans: [
      { uid: 'plan1', url: 'plan1.png', duration: 1000 },
      { uid: 'plan2', url: 'plan2.png', duration: 3000 }
    ] }
    view = new TopPlansTimeline({ getScene: () => scene, getFilename: () => '/tmp/project/scene.storyboarder', changed: () => changed++, edit: () => {} })
  })
  afterEach(() => { view.stop(); root.remove() })
  it('selects a plan by clicking its card or label and leaves duration editing alone', () => {
    view.show(true)
    const card = view.element.querySelector('[data-plan-index="1"]')
    card.click()
    assert.equal(view.selected.uid, 'plan2')
    view.select(0)
    card.querySelector('span').click()
    assert.equal(view.selected.uid, 'plan2')
    assert(view.image.src.includes('plan2'))
    view.select(0)
    card.querySelector('input').click()
    assert.equal(view.selected.uid, 'plan1')
  })
  it('plays the selected plan and following plans, then stops at the end', async () => {
    scene.topPlans = Array.from({ length: 3 }, (_, index) => ({ uid: `plan${index}`, url: `plan${index}.png`, duration: 80 }))
    view.show(true)
    view.select(1)
    const played = []
    view.player.update = (plan, data, filename, time) => played.push({ uid: plan.uid, time })
    view.element.querySelector('button').click()
    assert.equal(played[0].uid, 'plan1')
    assert(played[0].time < 80)
    await new Promise(resolve => setTimeout(resolve, 250))
    assert(!view.playing)
    assert(played.some(frame => frame.uid === 'plan2'))
    assert(!played.some(frame => frame.uid === 'plan0'))
    assert.equal(view.selected.uid, 'plan2')
  })
  it('keeps the timeline scrollable inside the main window flex layout', () => {
    const fs = require('fs')
    const path = require('path')
    const css = document.createElement('style')
    css.textContent = fs.readFileSync(path.join(__dirname, '../../src/css/mainwindow.css'), 'utf8')
    const shell = document.createElement('div')
    shell.style.cssText = 'display:flex;width:400px;flex-shrink:0;overflow:hidden'
    root.id = 'storyboarder-main'
    root.before(shell)
    shell.appendChild(root)
    document.head.appendChild(css)
    try {
      scene.topPlans = Array.from({ length: 12 }, (_, index) => ({ uid: `plan${index}`, url: `plan${index}.png` }))
      view.show(true)
      assert(root.getBoundingClientRect().width <= 400)
      assert(view.element.clientWidth <= 400)
      assert(view.element.scrollWidth > view.element.clientWidth)
      const actions = view.element.firstElementChild
      const leftBeforeScroll = actions.getBoundingClientRect().left
      const wheel = new WheelEvent('wheel', { deltaY: 140, cancelable: true, bubbles: true })
      view.element.dispatchEvent(wheel)
      assert(wheel.defaultPrevented)
      assert(view.element.scrollLeft > 0)
      assert(Math.abs(actions.getBoundingClientRect().left - leftBeforeScroll) <= 1)
      view.select(11)
      assert.equal(view.selected.uid, 'plan11')
      assert(view.element.querySelector('[data-plan-index="11"]').getBoundingClientRect().right <= view.element.getBoundingClientRect().right)
      assert(Math.abs(actions.getBoundingClientRect().left - leftBeforeScroll) <= 1)
      view.select(5)
      assert(view.element.querySelector('[data-plan-index="5"]').getBoundingClientRect().left >= actions.getBoundingClientRect().right)
    } finally {
      css.remove()
      shell.before(root)
      shell.remove()
    }
  })
  it('selects with arrow keys, clamps at the ends and leaves input keys alone', () => {
    view.show(true)
    const key = (name, target = view.element) => {
      const event = new KeyboardEvent('keydown', { key: name, cancelable: true, bubbles: true })
      target.addEventListener('keydown', event => view.handleKeyDown(event), { once: true })
      target.dispatchEvent(event)
      return event
    }
    assert(key('ArrowRight').defaultPrevented)
    assert.equal(view.selected.uid, 'plan2')
    key('ArrowRight')
    assert.equal(view.selected.uid, 'plan2')
    assert(!key('ArrowLeft', view.element.querySelector('input')).defaultPrevented)
    assert.equal(view.selected.uid, 'plan2')
    key('ArrowLeft'); key('ArrowLeft')
    assert.equal(view.selected.uid, 'plan1')
    view.show(false)
    assert(!key('ArrowRight').defaultPrevented)
    assert.equal(view.selected.uid, 'plan1')
  })
  it('scrolls horizontally with the mouse wheel and reveals keyboard selection', () => {
    scene.topPlans = Array.from({ length: 12 }, (_, index) => ({ uid: `plan${index}`, url: `plan${index}.png` }))
    view.element.style.width = '400px'
    view.show(true)
    const wheel = new WheelEvent('wheel', { deltaY: 140, cancelable: true, bubbles: true })
    view.element.dispatchEvent(wheel)
    assert(wheel.defaultPrevented)
    assert(view.element.scrollLeft > 0)
    view.select(11)
    const card = view.element.querySelector('[data-plan-index="11"]').getBoundingClientRect()
    const viewport = view.element.getBoundingClientRect()
    assert(card.left >= viewport.left)
    assert(card.right <= viewport.right)
    view.select(0)
    assert(view.element.querySelector('[data-plan-index="0"]').getBoundingClientRect().left >= viewport.left)
  })
  it('opens the clicked plan details on double click and keeps thumbnails mounted between clicks', () => {
    scene.topPlans[0].topPlanDetails = { sceneNumber: '1', sceneName: 'Kitchen' }
    scene.topPlans[1].topPlanDetails = { sceneNumber: '2', sceneName: 'Garden' }
    view.show(true)
    const thumbnail = view.element.querySelectorAll('img')[1]
    thumbnail.click()
    assert(thumbnail.isConnected)
    thumbnail.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    const dialog = document.querySelector('[aria-label="Top plan details"]')
    assert(dialog)
    assert.equal(dialog.querySelector('[aria-label="Scene name"]').value, 'Garden')
    assert.equal(view.selected.uid, 'plan2')
    dialog.querySelector('[type="button"]').click()
  })
  it('edits details, syncs saved Shot Generator data, re-sorts and retains selection', async () => {
    const details = { sceneNumber: '1', sceneName: 'Kitchen', planNumber: '1', planName: 'Wide', description: 'Opening', characterName: 'Alice', planType: 'static' }
    const plan = scene.topPlans[0]
    plan.topPlanDetails = { ...details }
    plan.sg = { data: { topPlanDetails: { ...details } } }
    scene.topPlans[1].topPlanDetails = { ...details, sceneNumber: '2' }
    view.show(true)
    const result = view.editDetails()
    const dialog = document.querySelector('[aria-label="Top plan details"]')
    const input = label => dialog.querySelector(`[aria-label="${label}"]`)
    assert.equal(input('Scene name').value, 'Kitchen')
    assert(input('Plan type').disabled)
    input('Scene number').value = '10'
    input('Scene name').value = 'Garden'
    input('Plan number').value = '3'
    input('Character name').value = 'شیما'
    dialog.querySelector('[type="submit"]').click()
    await result
    assert.equal(changed, 1)
    assert.deepStrictEqual(scene.topPlans.map(plan => plan.uid), ['plan2', 'plan1'])
    assert.strictEqual(view.selected, plan)
    assert.equal(plan.topPlanDetails.sceneName, 'Garden')
    assert.equal(plan.topPlanDetails.characterName, 'شیما')
    assert.deepStrictEqual(plan.sg.data.topPlanDetails, plan.topPlanDetails)
    assert(view.element.textContent.includes('Scene 10: Garden'))
  })
  it('cancels editing without changing saved details', async () => {
    view.show(true)
    const original = JSON.stringify(scene)
    const result = view.editDetails()
    const dialog = document.querySelector('[aria-label="Top plan details"]')
    dialog.querySelector('input').value = '99'
    dialog.querySelector('[type="button"]').click()
    await result
    assert.equal(JSON.stringify(scene), original)
    assert.equal(changed, 0)
  })
  it('exports Excel through its action and disables export when there are no plans', () => {
    let exported = 0
    view.exportExcel = () => exported++
    view.show(true)
    const excel = () => Array.from(view.element.querySelectorAll('button')).find(button => button.textContent === 'Export Excel')
    excel().click()
    assert.equal(exported, 1)
    scene.topPlans = []
    view.render()
    assert(excel().disabled)
  })
  it('renders only plans and edits duration without modifying storyboard boards', () => {
    view.show(true)
    assert.equal(view.element.querySelectorAll('input').length, 2)
    const duration = view.element.querySelector('input')
    duration.value = '4.5'; duration.onchange()
    assert.equal(scene.topPlans[0].duration, 4500)
    assert.deepStrictEqual(scene.boards, [{ uid: 'camera' }])
    assert.equal(changed, 1)
    assert(view.preview.style.display === 'block')
    view.show(false)
    assert(view.preview.style.display === 'none')
  })
  it('selects and deletes independently, including the final plan', () => {
    view.show(true)
    view.element.querySelectorAll('img')[1].click()
    assert.equal(view.selected.uid, 'plan2')
    const remove = () => Array.from(view.element.querySelectorAll('button')).find(b => b.textContent === 'Delete top plan').click()
    remove(); remove()
    assert.equal(scene.topPlans.length, 0)
    assert.equal(scene.boards.length, 1)
    assert(view.element.textContent.includes('No top plans yet'))
  })
  it('sorts by scene number while keeping selection and plays in scene order', () => {
    scene.topPlans[0].topPlanDetails = { sceneNumber: '10', sceneName: 'Later' }
    scene.topPlans[1].topPlanDetails = { sceneNumber: '2', sceneName: 'Earlier' }
    view.show(true)
    assert.deepStrictEqual(scene.topPlans.map(plan => plan.uid), ['plan2', 'plan1'])
    assert.strictEqual(view.selected.uid, 'plan1')
    const played = []
    view.player.update = plan => played.push(plan.uid)
    view.play()
    assert.strictEqual(view.selected.uid, 'plan1')
    assert.strictEqual(played[0], 'plan1')
    view.stop()
    Array.from(view.element.querySelectorAll('button')).find(button => button.textContent === 'Delete top plan').click()
    assert.deepStrictEqual(scene.topPlans.map(plan => plan.uid), ['plan2'])
  })
  it('shows the scene details on the timeline and playback', () => {
    scene.topPlans[0].topPlanDetails = { sceneNumber: '3', sceneName: 'Kitchen' }
    view.show(true)
    assert(view.element.textContent.includes('Scene 3: Kitchen'))
    view.player.update = () => {}
    view.play()
    assert(view.clock.textContent.includes('Scene 3: Kitchen'))
  })
  it('keeps playback running through control mouse events and advances local time', async () => {
    view.show(true)
    const previous = window.onmousedown
    window.onmousedown = () => view.stop()
    const times = []
    view.player.update = (board, data, filename, time) => times.push(time)
    try {
      const play = view.element.querySelector('button')
      play.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      play.click()
      await new Promise(resolve => setTimeout(resolve, 120))
      assert(view.playing)
      assert(times.length > 1)
      assert(times[times.length - 1] > times[0])
      const stop = view.element.querySelector('button')
      stop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      stop.click()
      assert.equal(view.playing, false)
    } finally { window.onmousedown = previous }
  })
  it('plays on its own clock and stops when hidden', () => {
    view.show(true); view.play()
    assert(view.playing)
    view.show(false)
    assert.equal(view.playing, false)
    assert.equal(scene.boards[0].uid, 'camera')
  })
})
