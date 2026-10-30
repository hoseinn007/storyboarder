const THREE = require('three')
const isSupported = motion => motion && motion.schemaVersion === 1
const durationFor = value => Number.isFinite(Number(value)) && Number(value) > 0
  ? Math.max(1, Math.round(Number(value))) : 2000
const isAnimatedObject = object => object && ['camera', 'character', 'object'].includes(object.type)
const orientation = object => {
  if (object.type === 'object') {
    const rotation = object.rotation || {}
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0, 'XYZ'))
  }
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    object.type === 'camera' ? object.tilt || 0 : 0,
    object.rotation || 0, object.type === 'camera' ? object.roll || 0 : 0, 'YXZ'))
}
const lens = fov => new THREE.PerspectiveCamera(fov, 2.348927875243665)

// Store authored local bone rotations, never mutable runtime IK positions.
const captureSkeleton = skeleton => Object.keys(skeleton || {}).reduce((result, name) => {
  const bone = skeleton[name]
  if (bone && bone.rotation) result[name] = { rotation: {
    x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z
  } }
  return result
}, {})
const capturePose = object => ({
  model: object.model,
  skeleton: captureSkeleton(object.skeleton),
  handSkeleton: captureSkeleton(object.handSkeleton),
  posePresetId: object.posePresetId || null,
  handPosePresetId: object.handPosePresetId || null
})
const interpolateSkeleton = (left, right, alpha) => Object.keys(left || {}).reduce((result, name) => {
  const a = left[name].rotation
  const b = right && right[name] && right[name].rotation
  if (!b) { result[name] = { rotation: { ...a } }; return result }
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a.x, a.y, a.z))
    .slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(b.x, b.y, b.z)), alpha)
  const rotation = new THREE.Euler().setFromQuaternion(q)
  result[name] = { rotation: { x: rotation.x, y: rotation.y, z: rotation.z } }
  return result
}, {})
const evaluatePose = (left, right, alpha) => {
  if (alpha >= 1) return right
  if (!alpha || left === right || left.model !== right.model) return left
  return { ...left, posePresetId: null, handPosePresetId: null,
    skeleton: interpolateSkeleton(left.skeleton, right.skeleton, alpha),
    handSkeleton: interpolateSkeleton(left.handSkeleton, right.handSkeleton, alpha) }
}

const captureKeyPoint = (objects, timeMs) => ({
  timeMs: Math.max(0, Math.round(timeMs)),
  objects: Object.values(objects).filter(isAnimatedObject)
    .reduce((result, object) => {
      result[object.id] = {
        type: object.type, x: object.x, y: object.y, z: object.z,
        visible: object.visible !== false,
        orientation: orientation(object).toArray(),
        ...(object.type === 'camera' ? { focalLengthMm: lens(object.fov).getFocalLength() } : {}),
        ...(object.type === 'character' ? { pose: capturePose(object) } : {})
      }
      return result
    }, {})
})

// Pure evaluation: playback never writes interpolated values into authored state.
const evaluateDynamicBoard = (objects, motion, timeMs) => {
  if (!isSupported(motion) || !motion.keyPoints.length) return objects
  const result = { ...objects }
  const time = Math.max(0, Math.min(motion.durationMs, timeMs))
  for (const id of Object.keys(objects)) {
    const keys = motion.keyPoints.filter(key => key.objects[id] && key.objects[id].type === objects[id].type)
    if (!keys.length) continue
    let left = keys[0], right = keys[0]
    for (const key of keys) {
      if (key.timeMs <= time) left = key
      right = key
      if (key.timeMs >= time) break
    }
    const alpha = left === right ? 0 : (time - left.timeMs) / (right.timeMs - left.timeMs)
    const a = left.objects[id], b = right.objects[id]
    const evaluated = { ...objects[id] }
    // Visibility holds until the next point; it must never fade or inherit a
    // later edit from the global scene object.
    const visibility = alpha >= 1 ? b.visible : a.visible
    evaluated.visible = visibility == null ? objects[id].visible !== false : visibility
    for (const axis of ['x', 'y', 'z']) evaluated[axis] = a[axis] + (b[axis] - a[axis]) * alpha
    const quaternion = new THREE.Quaternion().fromArray(a.orientation)
      .slerp(new THREE.Quaternion().fromArray(b.orientation), alpha)
    const euler = new THREE.Euler().setFromQuaternion(quaternion, objects[id].type === 'object' ? 'XYZ' : 'YXZ')
    evaluated.rotation = objects[id].type === 'character'
      ? Math.atan2(2 * (quaternion.w * quaternion.y + quaternion.x * quaternion.z), 1 - 2 * (quaternion.y * quaternion.y + quaternion.x * quaternion.x))
      : objects[id].type === 'object' ? { x: euler.x, y: euler.y, z: euler.z } : euler.y
    if (objects[id].type === 'camera') {
      evaluated.tilt = euler.x
      evaluated.roll = euler.z
      const camera = lens(objects[id].fov)
      camera.setFocalLength(a.focalLengthMm + (b.focalLengthMm - a.focalLengthMm) * alpha)
      evaluated.fov = camera.fov
    }
    if (objects[id].type === 'character') {
      const pose = evaluatePose(a.pose || capturePose(objects[id]), b.pose || capturePose(objects[id]), alpha)
      evaluated.skeleton = pose.skeleton
      evaluated.handSkeleton = pose.handSkeleton
      evaluated.posePresetId = pose.posePresetId
      evaluated.handPosePresetId = pose.handPosePresetId
    }
    result[id] = evaluated
  }
  return result
}

// Seed every target when it is created, before its first movement. Legacy
// camera/character-only boards also acquire static object keys on load.
const seedMotionTargets = (motion, previousObjects, objects) => {
  if (!isSupported(motion)) return motion
  const targets = Object.values(objects).filter(isAnimatedObject)
  let changed = false
  const keyPoints = motion.keyPoints.map(key => {
    let entries = key.objects
    for (const object of targets) {
      const stored = entries[object.id]
      const needsPose = object.type === 'character' && (!stored || !stored.pose)
      const needsVisibility = !stored || typeof stored.visible !== 'boolean'
      if (stored && !needsPose && !needsVisibility) continue
      if (entries === key.objects) entries = { ...entries }
      const initial = previousObjects[object.id] || object
      entries[object.id] = stored ? { ...stored,
        ...(needsPose ? { pose: capturePose(initial) } : {}),
        ...(needsVisibility ? { visible: initial.visible !== false } : {}) }
        : captureKeyPoint({ [object.id]: initial }, key.timeMs).objects[object.id]
      changed = true
    }
    return entries === key.objects ? key : { ...key, objects: entries }
  })
  return changed ? { ...motion, keyPoints } : motion
}

// Transform, visibility, and pose edits record keys; loading, selection, and playback
// never do. This runs inside redux-undo so the edit and key share one undo step.
const recordTransformEdit = (motion, previousObjects, objects, action) => {
  if (!isSupported(motion) || action.motionTimeMs == null) return motion
  const before = captureKeyPoint(previousObjects, action.motionTimeMs)
  const after = captureKeyPoint(objects, action.motionTimeMs)
  const changedIds = Object.keys(after.objects).filter(id =>
    JSON.stringify(before.objects[id]) !== JSON.stringify(after.objects[id]))
  if (!changedIds.length) return motion
  const atTime = motion.keyPoints.find(key => key.timeMs === after.timeMs)
  const frame = atTime || captureKeyPoint(evaluateDynamicBoard(objects, motion, after.timeMs), after.timeMs)
  const key = { ...frame, objects: { ...frame.objects } }
  for (const id of changedIds) key.objects[id] = after.objects[id]
  return motionReducer(motion, { type: 'SET_MOTION_KEY', payload: key })
}

const motionReducer = (state = null, action) => {
  switch (action.type) {
    case 'LOAD_SCENE': {
      const motion = action.payload.motion
      if (!motion) return null
      if (!isSupported(motion)) return motion
      const { baseObjects, ...data } = motion
      return data
    }
    case 'SET_BOARD_MOTION': return action.payload
    case 'SET_MOTION_DURATION': {
      if (!isSupported(state)) return state
      return { ...state, durationMs: Math.max(durationFor(action.payload), ...state.keyPoints.map(key => key.timeMs)) }
    }
    case 'SET_MOTION_KEY': {
      if (!isSupported(state)) return state
      const key = action.payload
      const keyPoints = state.keyPoints.filter(item => item.timeMs !== key.timeMs).concat(key)
        .sort((a, b) => a.timeMs - b.timeMs)
      return { ...state, durationMs: Math.max(state.durationMs, key.timeMs), keyPoints }
    }
    case 'DELETE_MOTION_KEY': {
      if (!isSupported(state)) return state
      // Keep the first point so the board always has a defined starting state.
      if (action.payload === 0) return state
      return { ...state, keyPoints: state.keyPoints.filter(key => key.timeMs !== action.payload) }
    }
    case 'MOVE_MOTION_KEY': {
      if (!isSupported(state) || action.payload.from === 0) return state
      const key = state.keyPoints.find(item => item.timeMs === action.payload.from)
      if (!key) return state
      const timeMs = Math.max(1, Math.min(state.durationMs, Math.round(action.payload.to)))
      if (!Number.isFinite(timeMs)) return state
      return { ...state, keyPoints: state.keyPoints.filter(item => item !== key && item.timeMs !== timeMs)
        .concat({ ...key, timeMs }).sort((a, b) => a.timeMs - b.timeMs) }
    }
    default: return state
  }
}
module.exports = { isAnimatedObject, seedMotionTargets, recordTransformEdit, isSupported, durationFor, captureKeyPoint, evaluateDynamicBoard, motionReducer }
