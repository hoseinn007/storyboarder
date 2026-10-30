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
  box.innerHTML = '<h2>Crop top plan</h2><p>Adjust the edges. This crop applies to the complete animation.</p>'
  overlay.appendChild(box)
  const preview = document.createElement('img')
  preview.style.cssText = 'display:block;width:100%;height:360px;object-fit:contain;background:#fff'
  box.appendChild(preview)
  const edges = {}
  const update = () => {
    const crop = value()
    preview.src = cropCanvas(source, crop)
  }
  const value = () => ({ x: +edges.Left.value / 100, y: +edges.Top.value / 100,
    width: 1 - (+edges.Left.value + +edges.Right.value) / 100,
    height: 1 - (+edges.Top.value + +edges.Bottom.value) / 100 })
  for (const name of ['Left', 'Right', 'Top', 'Bottom']) {
    const label = document.createElement('label'); label.textContent = name + ' trim (%) '
    label.style.cssText = 'display:inline-block;margin:12px'
    const input = document.createElement('input'); input.type = 'range'; input.min = 0; input.max = 45; input.value = 0
    input.setAttribute('aria-label', name + ' trim'); input.oninput = update
    edges[name] = input; label.appendChild(input); box.appendChild(label)
  }
  const finish = result => { overlay.remove(); resolve(result) }
  for (const [text, action] of [['Cancel', () => finish(null)], ['Reset', () => { Object.values(edges).forEach(el => { el.value = 0 }); update() }], ['Add top plan', () => finish(value())]]) {
    const button = document.createElement('button'); button.textContent = text
    button.style.cssText = 'padding:10px 20px;margin:8px'; button.onclick = action; box.appendChild(button)
  }
  document.body.appendChild(overlay); update()
})
module.exports = { chooseCrop, cropCanvas }
