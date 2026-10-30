const path = require('path')
const { pathToFileURL } = require('url')
const boardModel = require('../models/board')

// One decoded video surface follows the existing storyboard transport clock.
// No second Three.js scene or separate playback clock is needed in the editor.
class DynamicBoardPlayback {
  constructor(container, { exists = require('fs').existsSync, createVideo = () => document.createElement('video') } = {}) {
    this.container = container
    this.exists = exists
    this.video = createVideo()
    this.video.muted = true
    this.video.playsInline = true
    this.video.preload = 'auto'
    this.video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#111;z-index:20;pointer-events:none;display:none'
    this.video.addEventListener('error', () => this.stop())
    this.video.addEventListener('loadedmetadata', () => this.sync())
    this.container.appendChild(this.video)
    this.source = null
    this.target = null
  }
  update(board, scene, sceneFilename, localTimeMs) {
    if (!boardModel.isDynamicBoard(board)) { this.stop(); return }
    const filename = path.join(path.dirname(sceneFilename), 'images', boardModel.boardFilenameForDynamicVideo(board))
    if (this.source !== filename) {
      this.stop()
      if (!this.exists(filename)) return // Missing media falls back to the still board.
      this.source = filename
      this.video.src = pathToFileURL(filename).href
      this.video.load()
    }
    this.target = { localTimeMs, durationMs: boardModel.boardDuration(scene, board) }
    this.sync()
  }
  sync() {
    if (!this.target || !Number.isFinite(this.video.duration) || !this.video.duration) return
    const fraction = Math.max(0, Math.min(1, this.target.localTimeMs / this.target.durationMs))
    const targetTime = Math.min(this.video.duration - 0.001, fraction * this.video.duration)
    if (Math.abs(this.video.currentTime - targetTime) > 0.1 || this.video.paused) this.video.currentTime = targetTime
    this.video.style.display = 'block'
    // Timeline duration edits stretch the clip; audio overhang holds its final frame.
    const rate = this.video.duration * 1000 / this.target.durationMs
    if (fraction < 1 && rate >= 0.0625 && rate <= 16) {
      this.video.playbackRate = rate
      if (this.video.paused) this.video.play().catch(() => {})
    } else this.video.pause()
  }
  stop() {
    if (!this.source && !this.target) return
    this.target = null
    this.source = null
    this.video.pause()
    this.video.style.display = 'none'
    this.video.removeAttribute('src')
    this.video.load()
  }
}
module.exports = DynamicBoardPlayback
