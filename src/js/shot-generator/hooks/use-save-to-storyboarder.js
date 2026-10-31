import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { ipcRenderer } from 'electron'

import { 
  getSerializedState,
  getHash,
  getMotion,
  getSceneObjects,
  getActiveCamera,
  getEvaluatedSceneObjects,
  setMotionPlayback,
  getWorld,

  selectObject,
  markSaved,
} from '../../shared/reducers/shot-generator'
import { ShadingType } from '../../vendor/shading-effects/ShadingType'

import { SHOT_LAYERS } from '../utils/ShotLayers'
import useShadingEffect from '../hooks/use-shading-effect'
import { cache as assetCache } from './use-assets-manager'

const renderAll = (
  shotRenderer, cameraPlotRenderer,
  largeCanvasData, smallCanvasData,
  shotSize, cameraPlotSize,
  aspectRatio
) => {
  shotRenderer.current.setSize(shotSize.width, shotSize.height)
  renderShot(
    shotRenderer.current,
    largeCanvasData.current.scene,
    largeCanvasData.current.camera,
    { size: shotSize, aspectRatio }
  )
  let shotImageDataUrl = shotRenderer.current.domElement.toDataURL()

  cameraPlotRenderer.current.setSize(cameraPlotSize.width, cameraPlotSize.height)
  renderCameraPlot(
    cameraPlotRenderer.current,
    smallCanvasData.current.scene,
    smallCanvasData.current.camera,
    { size: cameraPlotSize }
  )
  let cameraPlotImageDataUrl = cameraPlotRenderer.current.domElement.toDataURL()

  return {
    shotImageDataUrl,
    cameraPlotImageDataUrl
  }
}

const setCameraAspectFromRendererSize = (renderer, camera) => {
  let size = renderer.getSize(new THREE.Vector2())
  camera.aspect = size.width / size.height
}

const renderShot = (renderer, scene, originalCamera) => {
  let camera = originalCamera.clone()

  camera.layers.set(SHOT_LAYERS)

  setCameraAspectFromRendererSize(renderer, camera)
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
}

const renderCameraPlot = (renderer, scene, originalCamera) => {
  let camera = originalCamera.clone()

  camera.left = camera.bottom
  camera.right = camera.top

  setCameraAspectFromRendererSize(renderer, camera)
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
}

const { chooseCrop, cropCanvas } = require('../services/crop-top-plan')
const { chooseTopPlanDetails } = require('../services/top-plan-details')
const { renderDynamicBoard } = require('../services/render-dynamic-board')
const { renderTopPlanBoard, getTopPlanBoardBounds } = require('../services/top-plan-board')
const { isSupported } = require('../../shared/reducers/shot-generator/dynamic-board')
const serialize = require('../../shared/reducers/shot-generator/serialize-scene-object')
const waitForScene = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
let saving = false

const sendSave = (channel, payload) => new Promise((resolve, reject) => {
  const requestId = THREE.MathUtils.generateUUID()
  const listener = (event, result) => {
    if (result.requestId !== requestId) return
    clearTimeout(timer)
    ipcRenderer.removeListener('shot-generator:save-result', listener)
    if (result.error) reject(new Error(result.error))
    else resolve()
  }
  const timer = setTimeout(() => {
    ipcRenderer.removeListener('shot-generator:save-result', listener)
    reject(new Error('Storyboarder did not confirm saving the board.'))
  }, 60000)
  ipcRenderer.on('shot-generator:save-result', listener)
  ipcRenderer.send(channel, { ...payload, requestId })
})

const saveShot = (insert, shotRenderer, cameraPlotRenderer, largeCanvasData, smallCanvasData, shotSize, cameraPlotSize, aspectRatio, forcedView) => async (dispatch, getState) => {
  if (saving) return
  saving = true
  const original = getState()
  const previousPlayback = original.motionPlayback
  let motion = getMotion(original)
  const renderView = forcedView || original.renderView || 'camera'
  const hash = getHash(original)
  let completed = false
  let planBounds
  let planCrop
  let relatedTopPlan
  let topPlanDetails = original.board.topPlanDetails || (original.board.sg && original.board.sg.data && original.board.sg.data.topPlanDetails)
  const needsPlan = insert || renderView === 'top-plan'
  const cancelled = () => getState().motionPlayback.cancelRequested || getState().board.uid !== original.board.uid
  const check = () => {
    if (cancelled()) throw new Error('Dynamic board rendering cancelled.')
    if (getHash(getState()) !== hash) throw new Error('The scene changed while rendering. Please save again.')
  }
  try {
    if (insert && needsPlan) {
      dispatch(setMotionPlayback({ playing: false }))
      const objects = getSceneObjects(original)
      const camera = objects[getActiveCamera(original)]
      // Use the same lens conversion as the Shot Generator camera inspector.
      const lens = camera && new THREE.PerspectiveCamera(camera.fov, 2.348927875243665).getFocalLength()
      const measurement = value => Number.isFinite(value) ? Number(value.toFixed(2)) : ''
      topPlanDetails = await chooseTopPlanDetails({
        ...topPlanDetails,
        characterName: Object.values(objects)
          .filter(object => object.type === 'character')
          .map(object => object.name || object.displayName || 'Character')
          .join(', '),
        cameraHeight: measurement(camera && camera.z),
        lens: measurement(lens),
        planType: motion ? 'dynamic' : 'static'
      })
      if (!topPlanDetails || cancelled()) return
      if (topPlanDetails.planType === 'dynamic' && !motion) {
        throw new Error('Select Dynamic in Board type and add at least two key points before adding a dynamic plan.')
      }
      if (topPlanDetails.planType === 'static') motion = null
    }
    if (isSupported(motion) && motion.keyPoints.length < 2) throw new Error('Add at least two key points before saving a dynamic board.')
    if (motion && !isSupported(motion)) throw new Error('This dynamic board uses an unsupported motion format.')
    if (needsPlan) planBounds = getTopPlanBoardBounds({ objects: getSceneObjects(original), world: getWorld(original), motion })
    if (motion) {
      // The legacy Redux `loaded` flag is not maintained by the current asset
      // manager. Inspect its cache and the rendered rigs instead.
      if (Object.values(assetCache.get()).some(asset => asset.status === 'PENDING')) {
        throw new Error('Wait for the scene assets to finish loading before saving a dynamic board.')
      }
      for (const object of Object.values(getSceneObjects(original)).filter(object => object.type === 'character' && renderView !== 'top-plan')) {
        let ready = false
        largeCanvasData.current.scene.traverse(node => {
          if (node.userData.id === object.id && node.getObjectByProperty('type', 'SkinnedMesh')) ready = true
        })
        if (!ready) throw new Error('A character model is not ready. Wait for it to load before saving.')
      }
    }
    dispatch(selectObject(null))
    dispatch(setMotionPlayback({ playing: false, rendering: !!motion, cancelRequested: false, progress: 0 }))
    if (needsPlan) {
      dispatch(setMotionPlayback({ timeMs: 0, preview: !!motion }))
      await waitForScene()
      renderTopPlanBoard(cameraPlotRenderer.current, smallCanvasData.current.scene, smallCanvasData.current.camera, shotSize,
        { objects: getEvaluatedSceneObjects(getState()), world: getWorld(getState()), motion, bounds: planBounds })
      if (insert) {
        planCrop = await chooseCrop(cameraPlotRenderer.current.domElement)
        if (!planCrop) return
      } else planCrop = getSerializedState(original).topPlanCrop || original.board.topPlanCrop
    }
    let video
    if (motion) {
      video = await renderDynamicBoard({
        durationMs: motion.durationMs, fps: original.board.fps,
        cancelled,
        onProgress: progress => dispatch(setMotionPlayback({ progress })),
        capture: async timeMs => {
          check()
          dispatch(setMotionPlayback({ timeMs, preview: true }))
          await waitForScene()
          check()
          if (renderView === 'top-plan') {
            renderTopPlanBoard(cameraPlotRenderer.current, smallCanvasData.current.scene, smallCanvasData.current.camera, shotSize,
              { objects: getEvaluatedSceneObjects(getState()), world: getWorld(getState()), motion, bounds: planBounds })
            return cropCanvas(cameraPlotRenderer.current.domElement, planCrop)
          }
          shotRenderer.current.setSize(shotSize.width, shotSize.height)
          renderShot(shotRenderer.current, largeCanvasData.current.scene, largeCanvasData.current.camera)
          return shotRenderer.current.domElement.toDataURL('image/png')
        }
      })
      // The first point is the board's still image outside timeline playback.
      dispatch(setMotionPlayback({ timeMs: 0, preview: true }))
    }
    await waitForScene()
    check()
    let { shotImageDataUrl, cameraPlotImageDataUrl } = renderAll(
      shotRenderer, cameraPlotRenderer, largeCanvasData, smallCanvasData, shotSize, cameraPlotSize, aspectRatio)
    const data = getSerializedState(original)
    if (insert && topPlanDetails) {
      data.topPlanDetails = topPlanDetails
      if (!motion) delete data.motion
    }
    if (renderView === 'top-plan') {
      data.renderView = 'top-plan'
      data.topPlanCrop = planCrop
      data.topPlanDetails = topPlanDetails
      renderTopPlanBoard(cameraPlotRenderer.current, smallCanvasData.current.scene, smallCanvasData.current.camera, shotSize,
        { objects: getEvaluatedSceneObjects(getState()), world: getWorld(getState()), motion, bounds: planBounds })
      shotImageDataUrl = cropCanvas(cameraPlotRenderer.current.domElement, planCrop)
    }
    if (motion) {
      const evaluated = getEvaluatedSceneObjects(getState())
      data.sceneObjects = Object.keys(evaluated).reduce((result, id) => {
        result[id] = serialize(evaluated[id])
        return result
      }, {})
    }
    if (insert && renderView !== 'top-plan') {
      let planVideo
      if (motion) {
        planVideo = await renderDynamicBoard({ durationMs: motion.durationMs, fps: original.board.fps, cancelled,
          onProgress: progress => dispatch(setMotionPlayback({ progress })),
          capture: async timeMs => {
            check(); dispatch(setMotionPlayback({ timeMs, preview: true })); await waitForScene(); check()
            renderTopPlanBoard(cameraPlotRenderer.current, smallCanvasData.current.scene, smallCanvasData.current.camera, shotSize,
              { objects: getEvaluatedSceneObjects(getState()), world: getWorld(getState()), motion, bounds: planBounds })
            return cropCanvas(cameraPlotRenderer.current.domElement, planCrop)
          } })
      }
      dispatch(setMotionPlayback({ timeMs: 0, preview: !!motion })); await waitForScene(); check()
      renderTopPlanBoard(cameraPlotRenderer.current, smallCanvasData.current.scene, smallCanvasData.current.camera, shotSize,
        { objects: getEvaluatedSceneObjects(getState()), world: getWorld(getState()), motion, bounds: planBounds })
      relatedTopPlan = { data: { ...data, renderView: 'top-plan', topPlanDetails }, crop: planCrop,
        images: { camera: cropCanvas(cameraPlotRenderer.current.domElement, planCrop), plot: cameraPlotImageDataUrl,
          ...(planVideo ? { video: planVideo } : {}) } }
    }
    await sendSave(insert ? 'insertShot' : 'saveShot', {
      uid: original.board.uid, currentBoard: original.board, data, relatedTopPlan, topPlanCrop: planCrop,
      images: { camera: shotImageDataUrl, plot: cameraPlotImageDataUrl, ...(video ? { video } : {}) }
    })
    completed = true
    if (getHash({ ...getState(), renderView: original.renderView, topPlanCrop: original.topPlanCrop }) === hash) dispatch(markSaved())
  } catch (error) {
    if (!cancelled()) window.alert(`Could not save board: ${error.message}`)
  } finally {
    if (getState().board.uid === original.board.uid) {
      dispatch(setMotionPlayback({ ...previousPlayback, playing: false, rendering: false, cancelRequested: false }))
    } else if (completed) {
      dispatch(setMotionPlayback({ rendering: false, playing: false, preview: getState().renderView === 'top-plan' && !!getMotion(getState()), cancelRequested: false }))
    }
    saving = false
  }
}
const saveCurrentShot = (...args) => saveShot(false, ...args)
const insertNewShot = (...args) => saveShot(true, ...args)

const useSaveToStoryboarder = (largeCanvasData, smallCanvasData, aspectRatio, shadingMode, backgroundColor) => {
  const dispatch = useDispatch()

  const imageRenderer = useRef()
  if (!imageRenderer.current) imageRenderer.current = new THREE.WebGLRenderer({ antialias: true })
  useEffect(() => {
    return () => {
      if (imageRenderer.current) imageRenderer.current = null
    }
  }, [])

  const shotSize = useMemo(() => new THREE.Vector2(Math.ceil(aspectRatio * 900), 900), [aspectRatio])
  const cameraPlotSize = useMemo(() => new THREE.Vector2(900, 900), [])

  const shotRenderer = useShadingEffect(imageRenderer.current, shadingMode, backgroundColor)
  const cameraPlotRenderer = useShadingEffect(imageRenderer.current, ShadingType.Outline, backgroundColor)

  const saveCurrentShotCb = useCallback(
    () => dispatch(
      saveCurrentShot(shotRenderer, cameraPlotRenderer, largeCanvasData, smallCanvasData, shotSize, cameraPlotSize, aspectRatio)
    ),
    [shotRenderer, cameraPlotRenderer, shotSize, cameraPlotSize, aspectRatio]
  )

  const insertTopPlanCb = useCallback(
    () => dispatch(saveShot(true, shotRenderer, cameraPlotRenderer, largeCanvasData, smallCanvasData,
      shotSize, cameraPlotSize, aspectRatio, 'top-plan')),
    [shotRenderer, cameraPlotRenderer, shotSize, cameraPlotSize, aspectRatio]
  )

  const insertNewShotCb = useCallback(
    () => dispatch(
      insertNewShot(shotRenderer, cameraPlotRenderer, largeCanvasData, smallCanvasData, shotSize, cameraPlotSize, aspectRatio)
    ),
    [shotRenderer, cameraPlotRenderer, shotSize, cameraPlotSize, aspectRatio]
  )

  return {
    saveCurrentShot: saveCurrentShotCb,
    insertNewShot: insertNewShotCb,
    insertTopPlan: insertTopPlanCb
  }
}

export default useSaveToStoryboarder
