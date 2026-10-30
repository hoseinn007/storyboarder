const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const { pathToFileURL } = require('url')
const execa = require('execa')
const ffmpeg = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
const boardModel = require('../models/board')
const common = require('./common')

// GIF stores centiseconds. Distribute rounding across the shot, rather than
// rounding every 24-fps frame to 40ms and shortening the animation.
const gifTiming = (durationMs, fps) => {
  const duration = Number.isFinite(Number(durationMs)) && Number(durationMs) > 0 ? Number(durationMs) : 2000
  const rate = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Math.min(30, Number(fps)) : 24
  const ticks = Math.max(1, Math.round(duration / 10))
  const count = Math.min(ticks, Math.max(1, Math.ceil(duration * rate / 1000)))
  return { count, durationMs: ticks * 10,
    delayAt: index => (Math.round((index + 1) * ticks / count) - Math.round(index * ticks / count)) * 10 }
}

async function * boardGifFrames (boards, destSize, projectFileAbsolutePath, boardData) {
  for (const board of boards) {
    const duration = boardModel.boardDuration(boardData, board)
    if (!boardModel.isDynamicBoard(board)) {
      const canvas = await common.flattenBoardToCanvas(board, null, [destSize.width, destSize.height], projectFileAbsolutePath)
      // Static frames can use long GIF delays, split at the format's limit.
      let remaining = gifTiming(duration, boardData.fps).durationMs
      while (remaining > 0) {
        const delay = Math.min(655350, remaining)
        yield { board, canvas, delay }
        remaining -= delay
      }
      continue
    }
    const clip = path.join(path.dirname(projectFileAbsolutePath), 'images', boardModel.boardFilenameForDynamicVideo(board))
    if (!await fs.pathExists(clip)) {
      throw new Error(`Missing animation for board ${board.shot || board.uid}. Save this dynamic board again in Shot Generator before exporting GIF.`)
    }
    const timing = gifTiming(duration, boardData.fps)
    const authoredDuration = Number(board.sg.data.motion.durationMs)
    if (!Number.isFinite(authoredDuration) || !(authoredDuration > 0)) throw new Error(`Invalid animation duration for board ${board.shot || board.uid}.`)
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'storyboarder-gif-'))
    try {
      const seconds = timing.durationMs / 1000
      await execa(ffmpeg, ['-y', '-loglevel', 'error', '-i', clip, '-an',
        '-vf', `setpts=${timing.durationMs / authoredDuration}*(PTS-STARTPTS),fps=${timing.count / seconds},scale=${destSize.width}:${destSize.height}:flags=lanczos,tpad=stop_mode=clone:stop_duration=${seconds}`,
        '-t', String(seconds), '-frames:v', String(timing.count),
        path.join(folder, 'frame-%07d.png')])
      const files = (await fs.readdir(folder)).filter(name => name.endsWith('.png')).sort()
      if (!files.length) throw new Error(`Could not decode animation for board ${board.shot || board.uid}.`)
      // Keep reference, drawing and notes layers above the animated SG layer.
      const overlayBoard = { ...board, layers: { ...board.layers } }
      delete overlayBoard.layers['shot-generator']
      const overlays = await common.getCanvasImageSourcesDataForBoard(overlayBoard, projectFileAbsolutePath)
      const canvas = document.createElement('canvas')
      canvas.width = destSize.width; canvas.height = destSize.height
      const context = canvas.getContext('2d')
      for (let index = 0; index < timing.count; index++) {
        const image = await common.getImage(pathToFileURL(path.join(folder, files[Math.min(index, files.length - 1)])).href)
        context.globalAlpha = 1
        context.fillStyle = 'white'
        context.fillRect(0, 0, destSize.width, destSize.height)
        context.drawImage(image, 0, 0, destSize.width, destSize.height)
        common.flattenCanvasImageSourcesDataToContext(context, overlays, [destSize.width, destSize.height])
        yield { board, canvas, delay: timing.delayAt(index) }
      }
    } finally {
      await fs.remove(folder)
    }
  }
}
module.exports = { gifTiming, boardGifFrames }
