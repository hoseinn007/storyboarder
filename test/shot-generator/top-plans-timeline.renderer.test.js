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
