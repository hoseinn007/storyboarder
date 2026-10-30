// Normalized crop coordinates are shared by the still and every animation frame.
const cropCanvas = (source, crop) => {
  if (!crop) return source.toDataURL('image/png')
  const canvas = document.createElement('canvas')
  canvas.width = source.width; canvas.height = source.height
  canvas.getContext('2d').drawImage(source,
    crop.x * source.width, crop.y * source.height,
    crop.width * source.width, crop.height * source.height,
    0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}
const chooseCrop = source => new Promise(resolve => {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', 'Crop top plan')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;display:flex;align-items:center;justify-content:center'
  const box = document.createElement('div')
  box.style.cssText = 'background:#292929;color:white;padding:24px;width:760px;max-width:90vw;max-height:95vh;overflow:auto'
  box.innerHTML = '<h2>Crop top plan</h2><p>Drag the box edges or corners to crop. Drag inside to move the selection. This crop applies to the complete animation.</p>'
  overlay.appendChild(box)
  const stage = document.createElement('div')
  stage.style.cssText = `position:relative;width:min(100%, ${50 * source.width / source.height}vh);margin:16px auto;background:#fff;overflow:hidden;touch-action:none;user-select:none`
  const preview = document.createElement('img')
  preview.src = source.toDataURL('image/png')
  preview.draggable = false
  preview.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none'
  stage.appendChild(preview)
  box.appendChild(stage)
  const selection = document.createElement('div')
  selection.setAttribute('aria-label', 'Crop selection')
  selection.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #50b8ff;box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 0 2000px rgba(0,0,0,.55);cursor:move;touch-action:none'
  stage.appendChild(selection)
  // Keep the composition guides inside the frame so they never intercept dragging.
  for (const position of [1 / 3, 2 / 3]) {
    for (const vertical of [true, false]) {
      const guide = document.createElement('div')
      guide.style.cssText = `position:absolute;pointer-events:none;background:rgba(255,255,255,.35);${vertical ? `left:${position * 100}%;top:0;bottom:0;width:1px` : `top:${position * 100}%;left:0;right:0;height:1px`}`
      selection.appendChild(guide)
    }
  }
  let crop = { x: 0, y: 0, width: 1, height: 1 }
  const value = () => ({ ...crop })
  const update = () => {
    selection.style.left = `${crop.x * 100}%`
    selection.style.top = `${crop.y * 100}%`
    selection.style.width = `${crop.width * 100}%`
    selection.style.height = `${crop.height * 100}%`
  }
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
  const resize = (edge, x, y, initial) => {
    let left = initial.x, top = initial.y
    let right = left + initial.width, bottom = top + initial.height
    if (edge.includes('Left')) left = clamp(x, 0, right - .02)
    if (edge.includes('Right')) right = clamp(x, left + .02, 1)
    if (edge.includes('Top')) top = clamp(y, 0, bottom - .02)
    if (edge.includes('Bottom')) bottom = clamp(y, top + .02, 1)
    crop = { x: left, y: top, width: right - left, height: bottom - top }
  }
  let stopDrag = () => {}
  const startDrag = (event, edge) => {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    stopDrag()
    const rect = stage.getBoundingClientRect()
    const initial = value()
    const startX = event.clientX, startY = event.clientY
    const move = next => {
      if (next.pointerId !== event.pointerId) return
      const dx = (next.clientX - startX) / rect.width
      const dy = (next.clientY - startY) / rect.height
      if (edge) {
        resize(edge, (edge.includes('Left') ? initial.x : initial.x + initial.width) + dx,
          (edge.includes('Top') ? initial.y : initial.y + initial.height) + dy, initial)
      } else {
        crop = { ...initial, x: clamp(initial.x + dx, 0, 1 - initial.width), y: clamp(initial.y + dy, 0, 1 - initial.height) }
      }
      update()
    }
    const end = next => { if (next.pointerId === event.pointerId) stopDrag() }
    stopDrag = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
  }
  selection.onpointerdown = event => startDrag(event)
  for (const edge of ['Left', 'Right', 'Top', 'Bottom', 'Top Left', 'Top Right', 'Bottom Left', 'Bottom Right']) {
    const handle = document.createElement('div')
    handle.setAttribute('role', 'slider')
    handle.setAttribute('aria-label', edge + ' crop edge')
    handle.tabIndex = 0
    const horizontal = edge.includes('Left') ? 'left:0;' : edge.includes('Right') ? 'right:0;' : 'left:0;right:0;'
    const vertical = edge.includes('Top') ? 'top:0;' : edge.includes('Bottom') ? 'bottom:0;' : 'top:0;bottom:0;'
    const corner = edge.includes(' ')
    const cursor = corner ? (edge === 'Top Left' || edge === 'Bottom Right' ? 'nwse' : 'nesw') : (edge === 'Left' || edge === 'Right' ? 'ew' : 'ns')
    handle.style.cssText = `position:absolute;${horizontal}${vertical}${corner ? 'width:20px;height:20px;' : edge === 'Left' || edge === 'Right' ? 'width:8px;' : 'height:8px;'}cursor:${cursor}-resize;touch-action:none`
    if (corner) {
      const bracket = document.createElement('div')
      const side = edge.includes('Left') ? 'left' : 'right'
      const end = edge.includes('Top') ? 'top' : 'bottom'
      bracket.style.cssText = `position:absolute;${side}:0;${end}:0;width:12px;height:12px;border-${side}:3px solid white;border-${end}:3px solid white;pointer-events:none`
      handle.appendChild(bracket)
    }
    const highlight = active => {
      selection.style.borderColor = active ? '#a5e3ff' : '#50b8ff'
      handle.style.backgroundColor = active ? 'rgba(80,184,255,.3)' : 'transparent'
    }
    handle.onpointerenter = () => highlight(true)
    handle.onpointerleave = () => highlight(false)
    handle.onfocus = () => highlight(true)
    handle.onblur = () => highlight(false)
    handle.onpointerdown = event => startDrag(event, edge)
    handle.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      const step = event.shiftKey ? .1 : .01
      resize(edge, (edge.includes('Left') ? crop.x : crop.x + crop.width) + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        (edge.includes('Top') ? crop.y : crop.y + crop.height) + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0), value())
      update()
    }
    selection.appendChild(handle)
  }
  const finish = result => { stopDrag(); overlay.remove(); resolve(result) }
  for (const [text, action] of [['Cancel', () => finish(null)], ['Reset', () => { crop = { x: 0, y: 0, width: 1, height: 1 }; update() }], ['Add top plan', () => finish(value())]]) {
    const button = document.createElement('button'); button.textContent = text
    button.style.cssText = 'padding:10px 20px;margin:8px'; button.onclick = action; box.appendChild(button)
  }
  document.body.appendChild(overlay); update()
})
module.exports = { chooseCrop, cropCanvas }
