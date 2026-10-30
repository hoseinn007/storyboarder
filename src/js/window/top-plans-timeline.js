const path = require('path')
const { pathToFileURL } = require('url')
const boardModel = require('../models/board')
const DynamicBoardPlayback = require('./dynamic-board-playback')

// This view owns its selection and transport; storyboard board indices never change.
class TopPlansTimeline {
  constructor({ getScene, getFilename, changed, edit, exportPdf }) {
    Object.assign(this, { getScene, getFilename, changed, edit, exportPdf })
    this.index = 0
    this.element = document.createElement('div')
    this.element.addEventListener('mousedown', event => event.stopPropagation())
    this.element.style.cssText = 'display:none;overflow-x:auto;padding:10px;background:#252525;min-height:145px;flex-shrink:0'
    document.querySelector('#playback').before(this.element)
    this.preview = document.createElement('div')
    this.preview.style.cssText = 'display:none;position:absolute;inset:0;background:#222;z-index:40'
    this.clock = document.createElement('div')
    this.clock.style.cssText = 'position:absolute;top:8px;left:8px;z-index:30;background:#222c;color:white;padding:8px;pointer-events:none'
    this.preview.appendChild(this.clock)
    this.image = document.createElement('img')
    this.image.style.cssText = 'width:100%;height:100%;object-fit:contain'
    this.preview.appendChild(this.image)
    document.querySelector('#storyboarder-sketch-pane').appendChild(this.preview)
    this.player = new DynamicBoardPlayback(this.preview)
  }
  get selected() { return (this.getScene().topPlans || [])[this.index] }
  stop() { this.playing = false; cancelAnimationFrame(this.frame); this.player.stop() }
  show(active) {
    this.active = active
    this.element.style.display = active ? 'flex' : 'none'
    this.preview.style.display = active ? 'block' : 'none'
    if (!active) this.stop()
    else this.render()
  }
  render() {
    const scene = this.getScene()
    const plans = scene.topPlans || []
    this.index = Math.max(0, Math.min(this.index, plans.length - 1))
    this.element.replaceChildren()
    const button = (label, action, parent = this.element) => {
      const el = document.createElement('button'); el.textContent = label
      el.onclick = action; parent.appendChild(el); return el
    }
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:135px;margin-right:12px'
    this.element.appendChild(actions)
    button(this.playing ? 'Stop' : '▶ Play top plans', () => this.playing ? (this.stop(), this.render()) : this.play(), actions)
    const pdfButton = button('Export PDF', () => { this.stop(); if (this.exportPdf) this.exportPdf() }, actions)
    pdfButton.disabled = !plans.length
    button('Edit in Shot Generator', () => this.edit(), actions)
    button('Delete top plan', () => {
      if (!this.selected) return
      this.stop(); scene.topPlans.splice(this.index, 1); this.changed(); this.render()
    }, actions)
    if (!plans.length) {
      const empty = document.createElement('span')
      empty.textContent = 'No top plans yet. Open Shot Generator and choose + Add top plan to timeline.'
      this.element.appendChild(empty); this.image.removeAttribute('src'); return
    }
    plans.forEach((plan, index) => {
      const card = document.createElement('div')
      card.style.cssText = `flex-shrink:0;width:160px;padding:5px;margin-right:8px;border:2px solid ${index === this.index ? '#56aaff' : '#555'}`
      const image = document.createElement('img')
      image.src = this.media(boardModel.boardFilenameForThumbnail(plan))
      image.style.cssText = 'width:100%;height:80px;object-fit:contain;cursor:pointer'
      image.onclick = () => { this.stop(); this.index = index; this.render() }
      card.appendChild(image)
      const label = document.createElement('span'); label.textContent = `Top plan ${index + 1} · `; card.appendChild(label)
      const duration = document.createElement('input')
      duration.type = 'number'; duration.min = '0.1'; duration.step = '0.1'
      duration.value = boardModel.boardDuration(scene, plan) / 1000
      duration.title = 'Duration in seconds'; duration.style.width = '55px'
      duration.onchange = () => {
        if (Number(duration.value) > 0) { this.stop(); plan.duration = Number(duration.value) * 1000; this.changed() }
      }
      card.appendChild(duration)
      this.element.appendChild(card)
    })
    this.image.src = this.media(boardModel.boardFilenameForPosterFrame(this.selected))
  }
  media(filename) { return pathToFileURL(path.join(path.dirname(this.getFilename()), 'images', filename)).href + '?v=' + Date.now() }
  play() {
    const plans = this.getScene().topPlans || []
    if (!plans.length) return
    this.stop(); this.index = 0; this.playing = true
    const started = performance.now()
    const tick = () => {
      if (!this.playing) return
      let time = performance.now() - started
      let index = 0
      while (index < plans.length && time >= boardModel.boardDuration(this.getScene(), plans[index])) {
        time -= boardModel.boardDuration(this.getScene(), plans[index++])
      }
      if (index === plans.length) { this.stop(); this.render(); return }
      const changed = index !== this.index
      if (changed) this.player.stop()
      this.index = index
      if (changed) this.render()
      this.clock.textContent = `Top plan ${index + 1} · ${(time / 1000).toFixed(1)} s`
      this.player.update(plans[index], this.getScene(), this.getFilename(), time)
      this.frame = requestAnimationFrame(tick)
    }
    this.render()
    tick()
  }
}
module.exports = TopPlansTimeline
