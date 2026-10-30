/* global describe it */
const assert = require('assert')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const { getPlanBounds, scaleBarLength, writeTopPlan, renderTopPlan } = require('../../src/js/shot-generator/services/top-plan')
const inside = (bounds, x, y) => {
  assert(x >= bounds.centerX - bounds.span / 2 && x <= bounds.centerX + bounds.span / 2)
  assert(y >= bounds.centerY - bounds.span / 2 && y <= bounds.centerY + bounds.span / 2)
}

describe('top plan export', () => {
  it('fits room boundaries and rotated object footprints', () => {
    const bounds = getPlanBounds({ objects: {
      prop: { type: 'object', x: 12, y: 0, z: 0, width: 6, height: 1, depth: 2, rotation: { x: 0, y: Math.PI / 2, z: 0 } }
    }, world: { room: { visible: true, width: 20, length: 10 } } })
    inside(bounds, -10, -5); inside(bounds, 10, 5)
    inside(bounds, 13, 3); inside(bounds, 11, -3)
    assert(bounds.span > 20)
  })
  it('includes full movement paths only when requested and respects current visibility', () => {
    const options = { objects: { actor: { type: 'character', x: 0, y: 0, visible: true },
      hidden: { type: 'object', x: 100, y: 100, visible: false } }, world: {},
      motion: { schemaVersion: 1, keyPoints: [{ objects: { actor: { x: 50, y: -20 } } }] } }
    const current = getPlanBounds({ ...options, includePaths: false })
    const movement = getPlanBounds({ ...options, includePaths: true })
    assert(current.span < 10)
    inside(movement, 50, -20)
    assert(movement.span < 100)
  })
  it('handles empty plans and provides a readable meter scale', () => {
    const bounds = getPlanBounds({ objects: {}, world: {} })
    assert(Number.isFinite(bounds.span))
    assert(scaleBarLength(bounds.span) > 0)
    assert(scaleBarLength(bounds.span) <= bounds.span / 5)
    assert.equal(scaleBarLength(30), 5)
    assert.equal(scaleBarLength(15), 2)
  })
  it('restores the live scene and camera if rendering fails', () => {
    const THREE = require('three')
    const scene = new THREE.Scene()
    const background = new THREE.Color('#123456')
    scene.background = background
    const icon = new THREE.Group(); icon.userData.type = 'camera'; scene.add(icon)
    const paths = new THREE.Group(); paths.userData.planPaths = true; scene.add(paths)
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5)
    let disposed = false, released = false
    assert.throws(() => renderTopPlan({ scene, camera, includePaths: false,
      state: { objects: {}, world: {}, board: {} }, createRenderer: () => ({
        setPixelRatio() {}, setSize() {},
        render(actual, exportCamera) {
          assert.strictEqual(actual, scene)
          assert.notStrictEqual(exportCamera, camera)
          assert.equal(paths.visible, false)
          throw new Error('Render failure')
        },
        dispose() { disposed = true }, forceContextLoss() { released = true }
      }) }), /Render failure/)
    assert.strictEqual(scene.background, background)
    assert.equal(paths.visible, true)
    assert.equal(camera.left, -5)
    assert(disposed && released)
  })

  it('writes PNG unchanged and a single-page PDF with the supplied plan', async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'top-plan-test-'))
    const png = await fs.readFile(path.join(__dirname, '../fixtures/shot-generator/images/board-1-UDRF3-thumbnail.png'))
    try {
      const image = path.join(folder, 'plan.png'), document = path.join(folder, 'plan.pdf')
      await writeTopPlan(image, 'png', png)
      assert((await fs.readFile(image)).equals(png))
      await writeTopPlan(document, 'pdf', png, 'Test top plan')
      const data = await fs.readFile(document)
      assert.equal(data.slice(0, 5).toString(), '%PDF-')
      const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true }).promise
      assert.equal(pdf.numPages, 1)
      await pdf.destroy()
      await assert.rejects(writeTopPlan(path.join(folder, 'bad.txt'), 'txt', png), /Unsupported/)
    } finally { await fs.remove(folder) }
  })
})

describe('top-plan timeline boards', () => {
  const THREE = require('three')
  const { renderTopPlanBoard, getTopPlanBoardBounds } = require('../../src/js/shot-generator/services/top-plan-board')
  const { createStore } = require('redux')
  const sg = require('../../src/js/shared/reducers/shot-generator')
  const boardModel = require('../../src/js/models/board')
  it('renders an overhead board at project aspect ratio without moving the viewport camera', () => {
    const original = new THREE.OrthographicCamera(-5, 5, 5, -5)
    original.position.set(0, 900, 0)
    const scene = new THREE.Scene()
    let captured
    const renderer = { setSize(width, height) { assert.equal(width, 1600); assert.equal(height, 900) },
      render(actualScene, camera) { assert.strictEqual(actualScene, scene); captured = camera } }
    const state = { objects: { camera: { type: 'camera', x: 0, y: 6 } }, world: {} }
    renderTopPlanBoard(renderer, scene, original, { width: 1600, height: 900 }, state)
    assert.notStrictEqual(captured, original)
    assert(Math.abs((captured.right - captured.left) / (captured.top - captured.bottom) - 1600 / 900) < 1e-8)
    assert.equal(captured.rotation.x, -Math.PI / 2)
    assert.equal(original.left, -5)
    assert.equal(original.position.x, 0)
  })
  it('fits hidden and moved props across all points into stable bounds', () => {
    const { captureKeyPoint } = require('../../src/js/shared/reducers/shot-generator/dynamic-board')
    const objects = { box: { id: 'box', type: 'object', x: 0, y: 0, z: 0, width: 10, height: 1, depth: 2,
      visible: true, rotation: { x: 0, y: 0, z: 0 } } }
    const motion = { schemaVersion: 1, durationMs: 2000, keyPoints: [captureKeyPoint(objects, 0),
      captureKeyPoint({ box: { ...objects.box, x: 30, visible: false } }, 2000)] }
    const bounds = getTopPlanBoardBounds({ objects, world: {}, motion })
    inside(bounds, -5, 0); inside(bounds, 35, 0)
    assert(bounds.span >= 44)
  })
  it('persists the top-plan output mode and opens its own overhead editor view', () => {
    const present = { ...sg.initialState.undoable, motion: null }
    const store = createStore(sg.reducer, { ...sg.initialState,
      undoable: { past: [], present, future: [], _latestUnfiltered: present, group: null } })
    const data = { world: sg.initialState.undoable.world, sceneObjects: sg.initialState.undoable.sceneObjects,
      activeCamera: sg.initialState.undoable.activeCamera, renderView: 'top-plan' }
    store.dispatch(sg.loadScene(JSON.parse(JSON.stringify(data))))
    assert.equal(store.getState().mainViewCamera, 'ortho')
    assert.equal(sg.getSerializedState(store.getState()).renderView, 'top-plan')
    assert.equal(sg.getIsSceneDirty(store.getState()), false)
    store.dispatch(sg.setBoard({ uid: 'PLAN', sg: { data }, duration: 2500 }))
    assert.equal(store.getState().renderView, 'top-plan')
    assert(boardModel.isTopPlanBoard({ sg: { data } }))
    assert(!boardModel.isDynamicBoard({ sg: { data } }))
    store.dispatch(sg.loadScene({ ...data, renderView: 'camera' }))
    assert.equal(store.getState().mainViewCamera, 'live')
    assert(!sg.getSerializedState(store.getState()).renderView)
  })
})
