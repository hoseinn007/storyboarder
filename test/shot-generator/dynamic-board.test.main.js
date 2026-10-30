/* global describe it */
const assert = require('assert')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const execa = require('execa')
const { createStore } = require('redux')
const { ActionCreators } = require('redux-undo')
const THREE = require('three')
const sg = require('../../src/js/shared/reducers/shot-generator')
const { captureKeyPoint, evaluateDynamicBoard, motionReducer } = require('../../src/js/shared/reducers/shot-generator/dynamic-board')
const { renderDynamicBoard, framePlan } = require('../../src/js/shot-generator/services/render-dynamic-board')
const boardModel = require('../../src/js/models/board')
const DynamicBoardPlayback = require('../../src/js/window/dynamic-board-playback')
const camera = { id: 'camera', type: 'camera', x: 0, y: 6, z: 1, rotation: 0, tilt: 0, roll: 0, fov: 40 }
const actor = { id: 'actor', type: 'character', model: 'adult-male', x: 0, y: 0, z: 0, rotation: 0, skeleton: {} }
const objects = () => ({ camera: { ...camera }, actor: { ...actor } })
const createMotion = () => ({ schemaVersion: 1, durationMs: 2000, keyPoints: [
  captureKeyPoint(objects(), 0), captureKeyPoint({ camera: { ...camera, x: 10, z: 3, fov: 20 }, actor: { ...actor, y: 4, rotation: Math.PI } }, 2000)
] })
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
const makeStore = () => {
  const present = { ...sg.initialState.undoable, motion: null }
  const store = createStore(sg.reducer, { ...sg.initialState,
    undoable: { past: [], present, future: [], _latestUnfiltered: present, group: null } })
  store.dispatch(sg.loadScene({ world: sg.initialState.undoable.world, sceneObjects: objects(), activeCamera: 'camera' }))
  store.dispatch(sg.setBoard({ uid: 'ABCDE', duration: 2000 }))
  store.dispatch(ActionCreators.clearHistory())
  return store
}

describe('dynamic boards', () => {
  it('interpolates camera and character movement without modifying source objects', () => {
    const base = objects()
    const result = evaluateDynamicBoard(base, createMotion(), 1000)
    near(result.camera.x, 5)
    near(result.camera.z, 2)
    near(result.actor.y, 2)
    near(result.actor.rotation, Math.PI / 2)
    near(new THREE.PerspectiveCamera(result.camera.fov, 2.348927875243665).getFocalLength(),
      (new THREE.PerspectiveCamera(40, 2.348927875243665).getFocalLength() + new THREE.PerspectiveCamera(20, 2.348927875243665).getFocalLength()) / 2)
    assert.equal(base.camera.x, 0)
    assert.equal(base.actor.y, 0)
    assert.equal(result.actor.model, 'adult-male')
  })
  it('keeps late-created characters and objects independent at each key point', () => {
    const store = makeStore()
    store.dispatch(sg.setBoardMotion(createMotion()))
    store.dispatch(sg.createObject({ ...actor, id: 'lateActor', x: 2 }))
    store.dispatch(sg.createObject({ id: 'box', type: 'object', model: 'box', x: 3, y: 1, z: 0,
      width: 1, height: 1, depth: 1, rotation: { x: 0, y: 0, z: 0 } }))
    const initial = sg.getMotion(store.getState()).keyPoints[0]
    assert.equal(initial.objects.lateActor.x, 2)
    assert.equal(initial.objects.box.x, 3)
    store.dispatch(sg.setMotionPlayback({ timeMs: 2000, preview: true }))
    store.dispatch({ type: 'EDIT_MOTION_FRAME', payload: sg.getEvaluatedSceneObjects(store.getState()) })
    store.dispatch(sg.setMotionPlayback({ preview: false }))
    const history = store.getState().undoable.past.length
    store.dispatch(sg.updateObjects({ lateActor: { x: 9, y: 0 }, box: { x: -4, y: 0, rotation: { x: 0.1, y: 0.2, z: 0.3 } } }))
    assert.equal(store.getState().undoable.past.length, history + 1)
    assert.strictEqual(sg.getMotion(store.getState()).keyPoints[0], initial)
    const evaluate = time => evaluateDynamicBoard(sg.getSceneObjects(store.getState()), sg.getMotion(store.getState()), time)
    near(evaluate(0).lateActor.x, 2)
    near(evaluate(0).box.x, 3)
    near(evaluate(2000).lateActor.x, 9)
    near(evaluate(2000).box.x, -4)
    near(evaluate(2000).box.rotation.z, 0.3)
    near(evaluate(1000).box.x, -0.5)
    // Returning a dragged object to zero must also be recorded.
    store.dispatch(sg.updateObjects({ lateActor: { x: 0 }, box: { x: 0 } }))
    near(evaluate(0).lateActor.x, 2)
    near(evaluate(2000).lateActor.x, 0)
    near(evaluate(2000).box.x, 0)
    store.dispatch(ActionCreators.undo())
    near(evaluate(2000).lateActor.x, 9)
    const saved = JSON.parse(JSON.stringify(sg.getSerializedState(store.getState())))
    store.dispatch(sg.loadScene(saved))
    near(evaluate(0).box.x, 3)
    near(evaluate(2000).box.x, -4)
    assert.equal(sg.getIsSceneDirty(store.getState()), false)
  })

  it('repairs legacy missing targets using the loaded scene, not a previous board', () => {
    const store = makeStore()
    store.dispatch(sg.updateObject('actor', { x: 99 }))
    const motion = createMotion()
    for (const key of motion.keyPoints) delete key.objects.actor
    store.dispatch(sg.loadScene({ world: sg.initialState.undoable.world, sceneObjects: objects(), activeCamera: 'camera', motion }))
    assert.equal(sg.getMotion(store.getState()).keyPoints[0].objects.actor.x, 0)
    assert.equal(sg.getMotion(store.getState()).keyPoints[1].objects.actor.x, 0)
    assert.equal(sg.getIsSceneDirty(store.getState()), false)
  })

  it('stores independent body and hand poses, interpolates them and round-trips them', () => {
    const store = makeStore()
    const start = { Spine: { rotation: { x: 0, y: 0, z: 0 } } }
    store.dispatch(sg.updateObject('actor', { skeleton: start, handSkeleton: { Thumb: { rotation: { x: 0, y: 0, z: 0 } } } }))
    store.dispatch(sg.setBoardMotion({ schemaVersion: 1, durationMs: 2000, keyPoints: [
      captureKeyPoint(sg.getSceneObjects(store.getState()), 0), captureKeyPoint(sg.getSceneObjects(store.getState()), 2000)
    ] }))
    store.dispatch(sg.setMotionPlayback({ timeMs: 2000, preview: false }))
    const history = store.getState().undoable.past.length
    store.dispatch(sg.updateObject('actor', { skeleton: { Spine: { rotation: { x: 0, y: 0, z: 1 } } },
      handSkeleton: { Thumb: { rotation: { x: 0, y: 0, z: 0.8 } } } }))
    assert.equal(store.getState().undoable.past.length, history + 1)
    const evaluate = time => evaluateDynamicBoard(sg.getSceneObjects(store.getState()), sg.getMotion(store.getState()), time).actor
    near(evaluate(0).skeleton.Spine.rotation.z, 0)
    near(evaluate(1000).skeleton.Spine.rotation.z, 0.5)
    near(evaluate(2000).skeleton.Spine.rotation.z, 1)
    near(evaluate(1000).handSkeleton.Thumb.rotation.z, 0.4)
    // Immer freezes dispatched poses; mutation must fail without changing a snapshot.
    assert.throws(() => { start.Spine.rotation.z = 9 }, TypeError)
    near(evaluate(0).skeleton.Spine.rotation.z, 0)
    store.dispatch(ActionCreators.undo())
    near(evaluate(2000).skeleton.Spine.rotation.z, 0)
    store.dispatch(ActionCreators.redo())
    store.dispatch(sg.loadScene(JSON.parse(JSON.stringify(sg.getSerializedState(store.getState())))))
    near(evaluate(0).skeleton.Spine.rotation.z, 0)
    near(evaluate(2000).skeleton.Spine.rotation.z, 1)
    store.dispatch(sg.markSaved())
    store.dispatch(sg.setMotionPlayback({ timeMs: 1000, preview: true }))
    near(sg.getEvaluatedSceneObjects(store.getState()).actor.skeleton.Spine.rotation.z, 0.5)
    assert.equal(sg.getIsSceneDirty(store.getState()), false)
  })

  it('records manual bone edits only at their selected time', () => {
    const store = makeStore()
    store.dispatch(sg.updateObject('actor', { skeleton: { Spine: { rotation: { x: 0, y: 0, z: 0 } } } }))
    store.dispatch(sg.setBoardMotion({ schemaVersion: 1, durationMs: 2000, keyPoints: [captureKeyPoint(sg.getSceneObjects(store.getState()), 0)] }))
    store.dispatch(sg.setMotionPlayback({ timeMs: 2000, preview: false }))
    store.dispatch(sg.updateCharacterSkeleton({ id: 'actor', name: 'Spine', rotation: { x: 0.2, y: 0, z: 0 } }))
    const keys = sg.getMotion(store.getState()).keyPoints
    near(keys[0].objects.actor.pose.skeleton.Spine.rotation.x, 0)
    near(keys[1].objects.actor.pose.skeleton.Spine.rotation.x, 0.2)
  })

  it('keys object and character visibility as a step and restores it on edit/reopen', () => {
    const store = makeStore()
    store.dispatch(sg.createObject({ id: 'box', type: 'object', model: 'box', x: 0, y: 0, z: 0,
      width: 1, height: 1, depth: 1, rotation: { x: 0, y: 0, z: 0 }, visible: true }))
    store.dispatch(sg.updateObject('actor', { visible: true }))
    store.dispatch(sg.setBoardMotion({ schemaVersion: 1, durationMs: 2000,
      keyPoints: [captureKeyPoint(sg.getSceneObjects(store.getState()), 0)] }))
    store.dispatch(sg.setMotionPlayback({ timeMs: 1000, preview: false }))
    store.dispatch(sg.updateObject('actor', { visible: false }))
    store.dispatch(sg.updateObject('box', { visible: false }))
    store.dispatch(sg.setMotionPlayback({ timeMs: 2000, preview: false }))
    store.dispatch(sg.updateObject('actor', { visible: true }))
    store.dispatch(sg.updateObject('box', { visible: true }))
    const evaluate = time => evaluateDynamicBoard(sg.getSceneObjects(store.getState()), sg.getMotion(store.getState()), time)
    for (const id of ['actor', 'box']) {
      assert.equal(evaluate(0)[id].visible, true)
      assert.equal(evaluate(999)[id].visible, true)
      assert.equal(evaluate(1000)[id].visible, false)
      assert.equal(evaluate(1999)[id].visible, false)
      assert.equal(evaluate(2000)[id].visible, true)
    }
    store.dispatch(sg.setMotionPlayback({ timeMs: 1000, preview: true }))
    store.dispatch({ type: 'EDIT_MOTION_FRAME', payload: sg.getEvaluatedSceneObjects(store.getState()) })
    assert.equal(sg.getSceneObjects(store.getState()).actor.visible, false)
    assert.equal(sg.getSceneObjects(store.getState()).box.visible, false)
    store.dispatch(sg.loadScene(JSON.parse(JSON.stringify(sg.getSerializedState(store.getState())))))
    assert.equal(evaluate(0).actor.visible, true)
    assert.equal(evaluate(1000).box.visible, false)
    assert.equal(evaluate(2000).box.visible, true)
    assert.equal(sg.getIsSceneDirty(store.getState()), false)
  })

  it('seeds visibility on legacy points before recording a visibility edit', () => {
    const store = makeStore()
    const motion = createMotion()
    for (const key of motion.keyPoints) for (const object of Object.values(key.objects)) delete object.visible
    store.dispatch(sg.setBoardMotion(motion))
    store.dispatch(sg.setMotionPlayback({ timeMs: 2000, preview: false }))
    store.dispatch(sg.updateObject('actor', { visible: false }))
    assert.equal(sg.getMotion(store.getState()).keyPoints[0].objects.actor.visible, true)
    assert.equal(sg.getMotion(store.getState()).keyPoints[1].objects.actor.visible, false)
    store.dispatch(ActionCreators.undo())
    assert.equal(sg.getMotion(store.getState()).keyPoints[1].objects.actor.visible, true)
  })

  it('uses shortest-arc rotation and holds endpoints', () => {
    const motion = createMotion()
    motion.keyPoints[0] = captureKeyPoint({ camera: { ...camera, rotation: 170 * Math.PI / 180 } }, 0)
    motion.keyPoints[1] = captureKeyPoint({ camera: { ...camera, rotation: -170 * Math.PI / 180 } }, 2000)
    near(Math.abs(evaluateDynamicBoard(objects(), motion, 1000).camera.rotation), Math.PI)
    near(evaluateDynamicBoard(objects(), motion, -10).camera.rotation, 170 * Math.PI / 180)
    near(evaluateDynamicBoard(objects(), motion, 3000).camera.rotation, -170 * Math.PI / 180)
  })
  it('protects the starting point and existing duration when retiming', () => {
    let motion = createMotion()
    assert.strictEqual(motionReducer(motion, sg.deleteMotionKey(0)), motion)
    assert.strictEqual(motionReducer(motion, sg.moveMotionKey({ from: 0, to: 1000 })), motion)
    motion = motionReducer(motion, sg.setMotionDuration(500))
    assert.equal(motion.durationMs, 2000)
    motion = motionReducer(motion, sg.moveMotionKey({ from: 2000, to: 1000 }))
    assert.deepEqual(motion.keyPoints.map(key => key.timeMs), [0, 1000])
    motion = motionReducer(motion, sg.setMotionKey(captureKeyPoint(objects(), 1000)))
    assert.equal(motion.keyPoints.length, 2)
  })
  it('keeps playback/render progress out of undo and dirty detection', () => {
    const store = makeStore()
    store.dispatch(sg.setBoardMotion(createMotion()))
    store.dispatch(sg.markSaved())
    const history = store.getState().undoable.past.length
    store.dispatch(sg.setMotionPlayback({ timeMs: 1000, preview: true, playing: true, progress: 0.5 }))
    near(sg.getEvaluatedSceneObjects(store.getState()).actor.y, 2)
    assert.equal(store.getState().undoable.past.length, history)
    assert.equal(sg.getIsSceneDirty(store.getState()), false)
    store.dispatch(sg.moveMotionKey({ from: 2000, to: 1500 }))
    assert.equal(store.getState().undoable.past.length, history + 1)
    store.dispatch(ActionCreators.undo())
    assert.equal(sg.getMotion(store.getState()).keyPoints[1].timeMs, 2000)
  })
  it('edits camera and actor transforms together in one undo step including zeros', () => {
    const store = makeStore()
    store.dispatch(sg.updateObject('camera', { x: 3 }))
    const history = store.getState().undoable.past.length
    store.dispatch({ type: 'EDIT_MOTION_FRAME', payload: objects() })
    assert.equal(sg.getSceneObjects(store.getState()).camera.x, 0)
    assert.equal(store.getState().undoable.past.length, history + 1)
    store.dispatch(ActionCreators.undo())
    assert.equal(sg.getSceneObjects(store.getState()).camera.x, 3)
  })
  it('round-trips editable motion independently of the static compatibility snapshot', () => {
    const store = makeStore()
    store.dispatch(sg.setBoardMotion(createMotion()))
    const data = JSON.parse(JSON.stringify(sg.getSerializedState(store.getState())))
    data.sceneObjects.camera.x = 123
    data.sceneObjects.actor.y = 456
    store.dispatch(sg.loadScene(data))
    assert.equal(sg.getSceneObjects(store.getState()).camera.x, 0)
    assert.equal(sg.getSceneObjects(store.getState()).actor.y, 0)
    assert.equal(sg.getMotion(store.getState()).keyPoints.length, 2)
    assert.equal(sg.getIsSceneDirty(store.getState()), false)
    store.dispatch(sg.setBoardMotion(null))
    assert(!sg.getSerializedState(store.getState()).motion)
  })
  it('preserves unknown schemas and leaves legacy projects static', () => {
    const store = makeStore()
    const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/shot-generator/shot-generator.storyboarder')))
    store.dispatch(sg.loadScene(legacy.boards[0].sg.data))
    assert.equal(sg.getMotion(store.getState()), null)
    const data = sg.getSerializedState(store.getState())
    data.motion = { schemaVersion: 999, future: true }
    store.dispatch(sg.loadScene(data))
    assert.deepEqual(sg.getSerializedState(store.getState()).motion, data.motion)
    store.dispatch(sg.setMotionDuration(500))
    assert.deepEqual(sg.getMotion(store.getState()), data.motion)
  })
  it('tracks dynamic clips as board media using a stable filename', () => {
    const board = { uid: 'ABCDE', url: 'board-1-ABCDE.png', sg: { data: { motion: createMotion() } } }
    assert(boardModel.isDynamicBoard(board))
    assert(boardModel.getMediaFilenames(board).includes('dynamic-ABCDE.mp4'))
    board.url = 'board-4-ABCDE.png'
    assert.equal(boardModel.boardFilenameForDynamicVideo(board), 'dynamic-ABCDE.mp4')
    delete board.sg.data.motion
    assert(!boardModel.getMediaFilenames(board).includes('dynamic-ABCDE.mp4'))
  })
  it('plans the final frame at the last key and supports fractional frame rates', () => {
    const plan = framePlan(1000, 23.976)
    assert.equal(plan.count, 24)
    assert.equal(plan.timeAt(23), 1000)
    assert.equal(framePlan(1, 24).count, 1)
  })
  it('encodes a decodable playback clip with the bundled ffmpeg', async function () {
    this.timeout(15000)
    const png = await fs.readFile(path.join(__dirname, '../fixtures/shot-generator/images/board-1-UDRF3-thumbnail.png'))
    const times = []
    const base64 = await renderDynamicBoard({ durationMs: 500, fps: 4,
      capture: async time => { times.push(time); return 'data:image/png;base64,' + png.toString('base64') } })
    assert.deepEqual(times, [0, 500])
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'dynamic-board-test-'))
    try {
      const file = path.join(folder, 'clip.mp4')
      await fs.writeFile(file, Buffer.from(base64, 'base64'))
      const decoded = await execa(require('ffmpeg-static'), ['-v', 'error', '-i', file, '-f', 'null', '-'])
      assert.equal(decoded.code, 0)
    } finally { await fs.remove(folder) }
  })
  it('cancels clip generation before capturing frames', async () => {
    let captured = false
    await assert.rejects(renderDynamicBoard({ durationMs: 2000, fps: 24, cancelled: () => true,
      capture: async () => { captured = true } }), /cancelled/)
    assert.equal(captured, false)
  })
})

describe('dynamic board storyboard playback', () => {
  const setup = exists => {
    const video = { style: {}, duration: 2, currentTime: 0, paused: true,
      addEventListener() {}, load() {}, removeAttribute() {},
      pause() { this.paused = true }, play() { this.paused = false; return Promise.resolve() } }
    const player = new DynamicBoardPlayback({ appendChild() {} }, { exists: () => exists, createVideo: () => video })
    const board = { uid: 'ABCDE', url: 'board.png', duration: 2000, sg: { data: { motion: createMotion() } } }
    return { video, player, board }
  }
  it('follows the transport clock and hides on static boards or stop', () => {
    const { video, player, board } = setup(true)
    player.update(board, {}, '/tmp/project.storyboarder', 1000)
    near(video.currentTime, 1)
    assert.equal(video.style.display, 'block')
    assert.equal(video.paused, false)
    player.update({ uid: 'static' }, {}, '/tmp/project.storyboarder', 0)
    assert.equal(video.style.display, 'none')
    assert.equal(video.paused, true)
  })
  it('stretches playback after board-duration changes and holds for audio overhang', () => {
    const { video, player, board } = setup(true)
    board.duration = 4000
    player.update(board, {}, '/tmp/project.storyboarder', 2000)
    near(video.currentTime, 1)
    near(video.playbackRate, 0.5)
    player.update(board, {}, '/tmp/project.storyboarder', 5000)
    assert.equal(video.paused, true)
    near(video.currentTime, 1.999)
  })
  it('falls back to the still board when the clip is missing', () => {
    const { video, player, board } = setup(false)
    player.update(board, {}, '/tmp/project.storyboarder', 1000)
    assert.equal(video.paused, true)
    assert.notEqual(video.style.display, 'block')
  })
})
