globalThis.IS_REACT_ACT_ENVIRONMENT = true
/* global describe it beforeEach afterEach */
require('@babel/register')({ presets: ['@babel/preset-env', '@babel/preset-react'] })
const assert = require('assert')
const React = require('react')
const ReactRoot = require('../../src/js/utils/react-root')
const { act } = React
const { Simulate } = require('react-dom/test-utils')
const { Provider } = require('react-redux')
const { createStore } = require('redux')
const sg = require('../../src/js/shared/reducers/shot-generator')
const DynamicBoard = require('../../src/js/shot-generator/components/DynamicBoard').default

const objects = () => ({
  camera: { id: 'camera', type: 'camera', x: 0, y: 6, z: 1, rotation: 0, tilt: 0, roll: 0, fov: 40 },
  actor: { id: 'actor', type: 'character', x: 0, y: 0, z: 0, rotation: 0, skeleton: {} }
})
describe('dynamic board authoring (renderer)', () => {
  let root, store, raf, cancel, nextFrame, saves, inserts
  const click = text => act(() => Simulate.click(Array.from(root.querySelectorAll('button')).find(button => button.textContent === text)))
  const changeType = value => act(() => Simulate.change(root.querySelector('[aria-label="Board type"]'), { target: { value } }))
  const seek = value => act(() => Simulate.change(root.querySelector('[aria-label="Dynamic board playhead"]'), { target: { value: String(value) } }))
  beforeEach(() => {
    saves = 0; inserts = 0
    raf = window.requestAnimationFrame; cancel = window.cancelAnimationFrame
    window.requestAnimationFrame = callback => { nextFrame = callback; return 1 }
    window.cancelAnimationFrame = () => { nextFrame = null }
    const present = { ...sg.initialState.undoable, motion: null }
    store = createStore(sg.reducer, { ...sg.initialState,
      undoable: { past: [], present, future: [], _latestUnfiltered: present, group: null } })
    store.dispatch(sg.loadScene({ world: present.world, sceneObjects: objects(), activeCamera: 'camera' }))
    store.dispatch(sg.setBoard({ uid: 'ABCDE', duration: 3000 }))
    root = document.createElement('div')
    root.style.cssText = 'position:relative;width:1000px;height:700px'
    document.body.appendChild(root)
    act(() => { ReactRoot.render(React.createElement(Provider, { store }, React.createElement(DynamicBoard, {
      onSave: () => saves++, onInsert: () => inserts++
    })), root) })
  })
  afterEach(() => {
    act(() => { ReactRoot.unmount(root) })
    root.remove(); window.requestAnimationFrame = raf; window.cancelAnimationFrame = cancel
  })
  it('keeps hide/show visible and allows moving and resizing without editing the shot', async () => {
    const style = document.createElement('style')
    style.textContent = '.dynamic-board {position:absolute}'
    document.head.appendChild(style)
    root.style.cssText = 'position:relative;width:1000px;height:700px'
    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      const panel = root.querySelector('.dynamic-board')
      const before = sg.getSerializedState(store.getState())
      const header = root.querySelector('.dynamic-board__header')
      const x = parseFloat(panel.style.left), y = parseFloat(panel.style.top)
      act(() => {
        Simulate.pointerDown(header, { button: 0, clientX: 100, clientY: 100 })
        Simulate.pointerMove(panel, { clientX: 150, clientY: 60 })
        Simulate.pointerUp(panel)
      })
      assert.equal(parseFloat(panel.style.left), x + 50)
      assert.equal(parseFloat(panel.style.top), y - 40)
      const width = parseFloat(panel.style.width), height = parseFloat(panel.style.height)
      act(() => {
        Simulate.pointerDown(root.querySelector('.dynamic-board__resize-corner'), { button: 0, clientX: 500, clientY: 500 })
        Simulate.pointerMove(panel, { clientX: 400, clientY: 450 })
        Simulate.pointerUp(panel)
      })
      assert.equal(parseFloat(panel.style.width), width - 100)
      assert.equal(parseFloat(panel.style.height), height - 50)
      const hide = root.querySelector('[aria-label="Hide dynamic settings"]')
      assert(hide.querySelector('svg polyline'))
      act(() => Simulate.click(hide))
      assert.equal(root.querySelector('.dynamic-board__content').hidden, true)
      const show = root.querySelector('[aria-label="Show dynamic settings"]')
      assert(show.textContent.includes('Show'))
      act(() => Simulate.click(show))
      assert.equal(root.querySelector('.dynamic-board__content').hidden, false)
      assert.equal(parseFloat(panel.style.width), width - 100)
      assert.deepEqual(sg.getSerializedState(store.getState()), before)
    } finally { style.remove() }
  })

  it('leaves a static board unchanged until Dynamic is selected', () => {
    assert.equal(sg.getMotion(store.getState()), null)
    assert(!root.querySelector('[aria-label="Dynamic board playhead"]'))
    changeType('dynamic')
    assert.equal(sg.getMotion(store.getState()).durationMs, 3000)
    assert.equal(sg.getMotion(store.getState()).keyPoints[0].timeMs, 0)
    changeType('static')
    assert.equal(sg.getMotion(store.getState()), null)
  })
  it('captures camera and actor key points and evaluates their movement together', () => {
    changeType('dynamic')
    seek(2000)
    click('Edit at this time')
    act(() => {
      store.dispatch(sg.updateObject('camera', { x: 10, tilt: 0.4 }))
      store.dispatch(sg.updateObject('actor', { y: 4 }))
    })
    click('Set key point')
    seek(1000)
    const evaluated = sg.getEvaluatedSceneObjects(store.getState())
    assert(Math.abs(evaluated.camera.x - 5) < 1e-7)
    assert(Math.abs(evaluated.actor.y - 2) < 1e-7)
    click('Save dynamic board')
    click('Insert as new dynamic board')
    assert.equal(saves, 1); assert.equal(inserts, 1)
  })
  it('records character and object edits without overwriting earlier points', () => {
    changeType('dynamic')
    act(() => {
      store.dispatch(sg.createObject({ ...objects().actor, id: 'lateActor', x: 2 }))
      store.dispatch(sg.createObject({ id: 'box', type: 'object', model: 'box', x: 3, y: 0, z: 0,
        width: 1, height: 1, depth: 1, rotation: { x: 0, y: 0, z: 0 } }))
    })
    seek(3000); click('Edit at this time')
    act(() => {
      store.dispatch(sg.updateObjects({ lateActor: { x: 8 }, box: { x: 10 } }))
    })
    // No manual Set key point: editing records only the selected time.
    assert.equal(sg.getMotion(store.getState()).keyPoints.length, 2)
    seek(0)
    assert.equal(sg.getEvaluatedSceneObjects(store.getState()).lateActor.x, 2)
    assert.equal(sg.getEvaluatedSceneObjects(store.getState()).box.x, 3)
    click('Return to editing')
    assert.equal(sg.getSceneObjects(store.getState()).box.x, 3)
    seek(3000)
    assert.equal(sg.getEvaluatedSceneObjects(store.getState()).lateActor.x, 8)
    assert.equal(sg.getEvaluatedSceneObjects(store.getState()).box.x, 10)
  })

  it('restores each character pose when switching between key points', () => {
    act(() => { store.dispatch(sg.updateObject('actor', { skeleton: { Spine: { rotation: { x: 0, y: 0, z: 0 } } } })) })
    changeType('dynamic')
    seek(3000); click('Edit at this time')
    act(() => { store.dispatch(sg.updateObject('actor', { skeleton: { Spine: { rotation: { x: 0, y: 0, z: 1 } } } })) })
    seek(0)
    assert.equal(sg.getEvaluatedSceneObjects(store.getState()).actor.skeleton.Spine.rotation.z, 0)
    click('Edit at this time')
    assert.equal(sg.getSceneObjects(store.getState()).actor.skeleton.Spine.rotation.z, 0)
    seek(3000)
    assert.equal(sg.getEvaluatedSceneObjects(store.getState()).actor.skeleton.Spine.rotation.z, 1)
    click('Edit at this time')
    assert.equal(sg.getSceneObjects(store.getState()).actor.skeleton.Spine.rotation.z, 1)
  })

  it('restores object and character visibility for each selected point', () => {
    act(() => {
      store.dispatch(sg.updateObject('actor', { visible: true }))
      store.dispatch(sg.createObject({ id: 'box', type: 'object', model: 'box', x: 0, y: 0, z: 0,
        width: 1, height: 1, depth: 1, rotation: { x: 0, y: 0, z: 0 }, visible: true }))
    })
    changeType('dynamic')
    seek(3000); click('Edit at this time')
    act(() => {
      store.dispatch(sg.updateObject('actor', { visible: false }))
      store.dispatch(sg.updateObject('box', { visible: false }))
    })
    seek(0); click('Edit at this time')
    assert.equal(sg.getSceneObjects(store.getState()).actor.visible, true)
    assert.equal(sg.getSceneObjects(store.getState()).box.visible, true)
    seek(3000); click('Edit at this time')
    assert.equal(sg.getSceneObjects(store.getState()).actor.visible, false)
    assert.equal(sg.getSceneObjects(store.getState()).box.visible, false)
  })

  it('previews to the end and stops without changing the document', () => {
    changeType('dynamic')
    seek(3000); click('Edit at this time'); click('Set key point')
    const motion = sg.getMotion(store.getState())
    seek(0); click('Preview')
    act(() => nextFrame(100))
    act(() => nextFrame(1600))
    assert.equal(store.getState().motionPlayback.timeMs, 1500)
    act(() => nextFrame(3100))
    assert.equal(store.getState().motionPlayback.playing, false)
    assert.strictEqual(sg.getMotion(store.getState()), motion)
  })
  it('protects future motion formats', () => {
    act(() => { store.dispatch(sg.loadScene({ world: sg.initialState.undoable.world,
      sceneObjects: objects(), activeCamera: 'camera', motion: { schemaVersion: 9 } })) })
    assert.equal(root.querySelector('[aria-label="Board type"]').disabled, true)
    assert(!root.querySelector('[aria-label="Dynamic board playhead"]'))
  })
})
