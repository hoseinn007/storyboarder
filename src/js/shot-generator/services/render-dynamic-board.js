const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const execa = require('execa')
const ffmpeg = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')

const framePlan = (durationMs, fps) => {
  const rate = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 24
  const count = Math.max(1, Math.ceil(durationMs * rate / 1000))
  return { fps: rate, count, timeAt: index => count > 1 && index === count - 1 ? durationMs : index * 1000 / rate }
}

// capture(timeMs) returns a PNG data URL after both scene views have settled.
const renderDynamicBoard = async ({ durationMs, fps, capture, onProgress = () => {}, cancelled = () => false }) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'storyboarder-motion-'))
  const plan = framePlan(durationMs, fps)
  const check = () => { if (cancelled()) throw new Error('Dynamic board rendering cancelled.') }
  try {
    for (let index = 0; index < plan.count; index++) {
      check()
      const dataUrl = await capture(plan.timeAt(index))
      await fs.writeFile(path.join(folder, `frame-${String(index).padStart(7, '0')}.png`),
        Buffer.from(dataUrl.split(',')[1], 'base64'))
      onProgress((index + 1) / plan.count * 0.9)
    }
    check()
    const output = path.join(folder, 'motion.mp4')
    const encoder = execa(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(plan.fps),
      '-i', path.join(folder, 'frame-%07d.png'), '-t', String(durationMs / 1000),
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'fast',
      '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output])
    const timer = setInterval(() => { if (cancelled()) encoder.kill() }, 200)
    try { await encoder } finally { clearInterval(timer) }
    check()
    onProgress(1)
    return (await fs.readFile(output)).toString('base64')
  } finally {
    await fs.remove(folder)
  }
}
module.exports = { renderDynamicBoard, framePlan }
