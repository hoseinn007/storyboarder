const THREE = require('three')
const fs = require('fs-extra')
const PDFDocument = require('pdfkit')

const getPlanBounds = ({ objects, world, motion, includePaths = true }) => {
  const points = []
  for (const object of Object.values(objects)) {
    if (object.visible === false || !Number.isFinite(object.x) || !Number.isFinite(object.y)) continue
    let extentX = 0.5, extentY = 0.5
    if (object.type === 'object') {
      const rotation = object.rotation || {}
      const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0)).elements
      const width = Math.abs(object.width || 1) / 2, height = Math.abs(object.height || 1) / 2, depth = Math.abs(object.depth || 1) / 2
      extentX = Math.abs(matrix[0]) * width + Math.abs(matrix[4]) * height + Math.abs(matrix[8]) * depth
      extentY = Math.abs(matrix[2]) * width + Math.abs(matrix[6]) * height + Math.abs(matrix[10]) * depth
    }
    points.push([object.x - extentX, object.y - extentY], [object.x + extentX, object.y + extentY])
  }
  if (world.room && world.room.visible) {
    points.push([-world.room.width / 2, -world.room.length / 2], [world.room.width / 2, world.room.length / 2])
  }
  if (includePaths && motion && motion.schemaVersion === 1) {
    for (const key of motion.keyPoints) for (const point of Object.values(key.objects)) {
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) points.push([point.x, point.y])
    }
  }
  if (!points.length) points.push([-2, -2], [2, 2])
  const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]))
  const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]))
  // Two meters of clearance includes camera frusta, labels and actor icons.
  const span = Math.max(maxX - minX, maxY - minY, 4) + 4
  return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, span }
}
const scaleBarLength = span => {
  const target = span / 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)))
  return [5, 2, 1].map(value => value * magnitude).find(value => value <= target) || magnitude / 2
}

const renderTopPlan = ({ scene, camera, state, includePaths = true, createRenderer = options => new THREE.WebGLRenderer(options) }) => {
  if (!scene || !camera || !camera.isOrthographicCamera) throw new Error('The top-down view is not ready yet.')
  const objects = state.objects
  let hasCameraIcon = false
  scene.traverse(node => { if (node.userData.type === 'camera') hasCameraIcon = true })
  if (!hasCameraIcon) throw new Error('Wait for the top-down camera icons to finish loading.')
  const bounds = getPlanBounds({ objects, world: state.world, motion: state.motion, includePaths })
  const ortho = camera.clone()
  ortho.position.set(bounds.centerX, 900, bounds.centerY)
  ortho.rotation.set(-Math.PI / 2, 0, 0)
  ortho.left = ortho.bottom = -bounds.span / 2
  ortho.right = ortho.top = bounds.span / 2
  ortho.near = -1000
  ortho.far = 2000
  ortho.zoom = 1
  ortho.updateProjectionMatrix()
  ortho.updateMatrixWorld(true)
  const renderer = createRenderer({ antialias: true, preserveDrawingBuffer: true })
  const previousBackground = scene.background
  const hidden = []
  const planSize = 2200, margin = 100, top = 180
  try {
    // IconSprites cannot be deep-cloned without their font constructor inputs.
    // Render the overhead scene synchronously, restoring all temporary state
    // before the next animation frame can observe it.
    scene.background = new THREE.Color('white')
    scene.traverse(node => {
      if ((node.userData.planPaths && !includePaths) || node.userData.type === 'xr-client') {
        hidden.push([node, node.visible]); node.visible = false
      }
    })
    renderer.setPixelRatio(1)
    renderer.setSize(planSize, planSize)
    scene.updateMatrixWorld(true)
    renderer.render(scene, ortho)
    const canvas = document.createElement('canvas')
    canvas.width = planSize + margin * 2
    canvas.height = 2680
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#20242b'
    context.font = 'bold 54px sans-serif'
    context.fillText(`Top plan — ${state.board.shot || state.board.uid || 'Shot'}`, margin, 85, planSize)
    context.font = '30px sans-serif'
    context.fillStyle = '#555b65'
    const time = state.preview ? `${(state.timeMs / 1000).toFixed(2)} s` : 'Editing state'
    context.fillText(`${time} · ${includePaths && state.motion ? 'All authored movement paths' : 'Current layout'}`, margin, 140, planSize)
    context.drawImage(renderer.domElement, margin, top, planSize, planSize)
    context.strokeStyle = '#aeb4bd'
    context.lineWidth = 2
    context.strokeRect(margin, top, planSize, planSize)
    const meters = scaleBarLength(bounds.span), barPixels = meters / bounds.span * planSize
    const y = 2470
    context.strokeStyle = '#20242b'
    context.lineWidth = 6
    context.beginPath()
    context.moveTo(margin, y); context.lineTo(margin + barPixels, y)
    context.moveTo(margin, y - 14); context.lineTo(margin, y + 14)
    context.moveTo(margin + barPixels, y - 14); context.lineTo(margin + barPixels, y + 14)
    context.stroke()
    context.fillStyle = '#20242b'
    context.font = '32px sans-serif'
    context.fillText(`${meters} m`, margin, y - 30)
    context.font = '27px sans-serif'
    if (includePaths && state.motion) {
      context.fillText('Blue: cameras   ·   Amber: characters   ·   Purple: objects', margin, 2550, planSize)
    }
    context.fillStyle = '#626874'
    context.fillText('Shot Generator overhead layout · Scale bar applies to this plan', margin, 2610, planSize)
    return Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64')
  } finally {
    scene.background = previousBackground
    for (const [node, visible] of hidden) node.visible = visible
    // Geometry and textures belong to the editor; dispose only this renderer.
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

const writeTopPlan = async (filename, format, png, title = 'Shot Generator top plan') => {
  if (format === 'png') { await fs.writeFile(filename, png); return }
  if (format !== 'pdf') throw new Error('Unsupported top-plan format.')
  const data = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 24, info: { Title: title, Creator: 'Storyboarder' } })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.image(png, 24, 24, { fit: [doc.page.width - 48, doc.page.height - 48], align: 'center', valign: 'center' })
    doc.end()
  })
  await fs.writeFile(filename, data)
}
module.exports = { getPlanBounds, scaleBarLength, renderTopPlan, writeTopPlan }
