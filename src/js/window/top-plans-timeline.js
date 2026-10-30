const path = require('path')
const { pathToFileURL } = require('url')
const boardModel = require('../models/board')
const DynamicBoardPlayback = require('./dynamic-board-playback')
const topPlanLabel = require('../models/top-plan-label')
const { sortBySceneNumber } = require('../models/top-plans')
const { chooseTopPlanDetails } = require('../shot-generator/services/top-plan-details')

// This view owns its selection and transport; storyboard board indices never change.
class TopPlansTimeline {
  constructor({ getScene, getFilename, changed, edit, exportPdf, exportExcel }) {
    Object.assign(this, { getScene, getFilename, changed, edit, exportPdf, exportExcel })
    this.index = 0
    this.element = document.createElement('div')
    this.element.addEventListener('mousedown', event => event.stopPropagation())
    this.element.style.cssText = 'display:none;overflow-x:auto;overflow-y:hidden;min-width:0;max-width:100%;box-sizing:border-box;padding:10px;background:#252525;color:#eee;min-height:145px;flex-shrink:0'
    this.element.tabIndex = 0
    this.element.setAttribute('aria-label', 'Top Plans Timeline')
    this.element.addEventListener('wheel', event => {
      if (event.ctrlKey || event.target.closest('input, textarea, select')) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta || this.element.scrollWidth <= this.element.clientWidth) return
      event.preventDefault()
      event.stopPropagation()
      const scale = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? this.element.clientWidth : 1
      this.element.scrollLeft += delta * scale
    }, { passive: false })
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
    const selected = plans[this.index]
    sortBySceneNumber(plans)
    if (selected) this.index = plans.indexOf(selected)
    this.index = Math.max(0, Math.min(this.index, plans.length - 1))
    this.element.replaceChildren()
    const button = (label, action, parent = this.element) => {
      const el = document.createElement('button'); el.textContent = label
      el.onclick = action; parent.appendChild(el); return el
    }
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:135px;flex-shrink:0;margin-right:12px;position:sticky;left:0;z-index:1;background:#252525;padding-right:12px'
    this.element.appendChild(actions)
    button(this.playing ? 'Stop' : '▶ Play top plans', () => this.playing ? (this.stop(), this.render()) : this.play(), actions)
    const pdfButton = button('Export PDF', () => { this.stop(); if (this.exportPdf) this.exportPdf() }, actions)
    pdfButton.disabled = !plans.length
    const excelButton = button('Export Excel', () => { this.stop(); if (this.exportExcel) this.exportExcel() }, actions)
    excelButton.disabled = !plans.length
    const detailsButton = button('Edit details', () => this.editDetails(), actions)
    detailsButton.disabled = !plans.length
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
      card.dataset.planIndex = index
      card.style.cssText = `flex-shrink:0;width:160px;padding:5px;margin-right:8px;border:2px solid ${index === this.index ? '#56aaff' : '#555'}`
      card.style.cursor = 'pointer'
      card.onclick = event => {
        if (event.target.closest('input, button, textarea, select')) return
        this.select(index)
        this.element.focus({ preventScroll: true })
      }
      card.ondblclick = event => {
        if (event.target.closest('input, button')) return
        this.index = index
        this.editDetails()
      }
      const image = document.createElement('img')
      image.src = this.media(boardModel.boardFilenameForThumbnail(plan))
      image.style.cssText = 'width:100%;height:80px;object-fit:contain;cursor:pointer'
      card.appendChild(image)
      const label = document.createElement('span'); label.textContent = `${topPlanLabel(plan, index)} · `; card.appendChild(label)
      card.title = topPlanLabel(plan, index)
      const duration = document.createElement('input')
      duration.type = 'number'; duration.min = '0.1'; duration.step = '0.1'
      duration.value = boardModel.boardDuration(scene, plan) / 1000
      duration.title = 'Duration in seconds'
      duration.style.cssText = 'width:55px;color:#eee;background:#333;border:1px solid #777'
      duration.onchange = () => {
        if (Number(duration.value) > 0) { this.stop(); plan.duration = Number(duration.value) * 1000; this.changed() }
      }
      card.appendChild(duration)
      this.element.appendChild(card)
    })
    this.image.src = this.media(boardModel.boardFilenameForPosterFrame(this.selected))
    this.revealSelection()
  }
  revealSelection() {
    const card = this.element.querySelector(`[data-plan-index="${this.index}"]`)
    if (!card) return
    const viewport = this.element.getBoundingClientRect()
    const actions = this.element.firstElementChild.getBoundingClientRect()
    const visibleLeft = Math.max(viewport.left, actions.right)
    const bounds = card.getBoundingClientRect()
    if (bounds.left < visibleLeft) this.element.scrollLeft -= visibleLeft - bounds.left + 10
    else if (bounds.right > viewport.right) this.element.scrollLeft += bounds.right - viewport.right + 10
  }
  select(index) {
    const plans = this.getScene().topPlans || []
    if (!plans.length) return
    this.stop()
    this.index = Math.max(0, Math.min(index, plans.length - 1))
    this.element.querySelector('button').textContent = '▶ Play top plans'
    // Preserve mounted cards so a second click can trigger the details dialog.
    this.element.querySelectorAll('[data-plan-index]').forEach(card => {
      card.style.borderColor = Number(card.dataset.planIndex) === this.index ? '#56aaff' : '#555'
    })
    this.image.src = this.media(boardModel.boardFilenameForPosterFrame(this.selected))
    this.revealSelection()
  }
  handleKeyDown(event) {
    if (!this.active || this.editingDetails || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
    if (event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return false
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
    event.preventDefault()
    event.stopPropagation()
    this.select(this.index + (event.key === 'ArrowRight' ? 1 : -1))
    return true
  }
  async editDetails() {
    const scene = this.getScene()
    const plan = this.selected
    if (!plan || this.editingDetails) return
    this.stop()
    this.render()
    this.editingDetails = true
    try {
      const initial = plan.topPlanDetails || (plan.sg && plan.sg.data && plan.sg.data.topPlanDetails) || {}
      const details = await chooseTopPlanDetails({
        ...initial,
        planType: initial.planType || (boardModel.isDynamicBoard(plan) ? 'dynamic' : 'static')
      }, { submitLabel: 'Save changes', lockPlanType: true })
      if (!details || this.getScene() !== scene || !(scene.topPlans || []).includes(plan)) return
      plan.topPlanDetails = details
      if (plan.sg && plan.sg.data) plan.sg.data.topPlanDetails = { ...details }
      sortBySceneNumber(scene.topPlans)
      this.index = scene.topPlans.indexOf(plan)
      this.changed()
      this.render()
    } finally { this.editingDetails = false }
  }
  media(filename) { return pathToFileURL(path.join(path.dirname(this.getFilename()), 'images', filename)).href + '?v=' + Date.now() }
  play() {
    const selected = this.selected
    const plans = sortBySceneNumber(this.getScene().topPlans || [])
    if (!plans.length) return
    const startIndex = Math.max(0, plans.indexOf(selected))
    this.stop(); this.index = startIndex; this.playing = true
    const started = performance.now()
    const tick = () => {
      if (!this.playing) return
      let time = performance.now() - started
      let index = startIndex
      while (index < plans.length && time >= boardModel.boardDuration(this.getScene(), plans[index])) {
        time -= boardModel.boardDuration(this.getScene(), plans[index++])
      }
      if (index === plans.length) { this.stop(); this.render(); return }
      const changed = index !== this.index
      if (changed) this.player.stop()
      this.index = index
      if (changed) this.render()
      this.clock.textContent = `${topPlanLabel(plans[index], index)} · ${(time / 1000).toFixed(1)} s`
      this.player.update(plans[index], this.getScene(), this.getFilename(), time)
      this.frame = requestAnimationFrame(tick)
    }
    this.render()
    tick()
  }
}
module.exports = TopPlansTimeline
