const { getPlanBounds } = require('./top-plan')
const { evaluateDynamicBoard } = require('../../shared/reducers/shot-generator/dynamic-board')

const getTopPlanBoardBounds = state => {
  const objects = { ...state.objects }
  if (state.motion && state.motion.schemaVersion === 1) {
    for (const key of state.motion.keyPoints) {
      const evaluated = evaluateDynamicBoard(state.objects, state.motion, key.timeMs)
      for (const [id, object] of Object.entries(evaluated)) {
        objects[`${id}@${key.timeMs}`] = { ...object, visible: true }
      }
    }
  }
  return getPlanBounds({ objects, world: state.world, motion: state.motion, includePaths: true })
}

// Keep the overhead camera independent from the live shot camera. The output
// uses the project's aspect ratio so it is a normal storyboard layer/clip.
const renderTopPlanBoard = (renderer, scene, originalCamera, size, state) => {
  if (!scene || !originalCamera || !originalCamera.isOrthographicCamera) throw new Error('The top-down view is not ready yet.')
  const bounds = state.bounds || getTopPlanBoardBounds(state)
  const camera = originalCamera.clone()
  const aspect = size.width / size.height
  camera.position.set(bounds.centerX, 900, bounds.centerY)
  camera.rotation.set(-Math.PI / 2, 0, 0)
  camera.left = -bounds.span / 2 * Math.max(1, aspect)
  camera.right = -camera.left
  camera.top = bounds.span / 2 * Math.max(1, 1 / aspect)
  camera.bottom = -camera.top
  camera.near = -1000; camera.far = 2000; camera.zoom = 1
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  renderer.setSize(size.width, size.height)
  renderer.render(scene, camera)
}
module.exports = { renderTopPlanBoard, getTopPlanBoardBounds }
