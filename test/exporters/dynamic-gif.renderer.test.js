/* global describe it beforeEach afterEach */
const assert = require('assert')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const execa = require('execa')
window.TONE_SILENCE_VERSION_LOGGING = true
const exporter = require('../../src/js/window/exporter')
const { gifTiming } = require('../../src/js/exporters/gif-frames')
const { renderDynamicBoard } = require('../../src/js/shot-generator/services/render-dynamic-board')
const ffmpeg = require('ffmpeg-static')

// Read real GIF control/image blocks, independently of the exporter.
const frameDelays = buffer => {
  let offset = 13 + ((buffer[10] & 128) ? 3 * Math.pow(2, (buffer[10] & 7) + 1) : 0)
  const delays = []
  let delay = 0
  const skipBlocks = () => {
    let length
    while ((length = buffer[offset++])) offset += length
  }
  while (offset < buffer.length) {
    const marker = buffer[offset++]
    if (marker === 0x3b) return delays
    if (marker === 0x21) {
      const label = buffer[offset++]
      if (label === 0xf9) delay = buffer.readUInt16LE(offset + 2) * 10
      skipBlocks()
    } else if (marker === 0x2c) {
      const flags = buffer[offset + 8]
      offset += 9
      if (flags & 128) offset += 3 * Math.pow(2, (flags & 7) + 1)
      offset++ // LZW minimum code size
      skipBlocks()
      delays.push(delay); delay = 0
    } else throw new Error(`Unexpected GIF block ${marker}`)
  }
  throw new Error('GIF trailer was not written')
}
const colorPng = color => {
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90
  const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 160, 90)
  return canvas.toDataURL('image/png')
}

describe('dynamic GIF export', function () {
  this.timeout(30000)
  let folder, project, data
  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'storyboarder-gif-test-'))
    await fs.ensureDir(path.join(folder, 'images'))
    project = path.join(folder, 'test.storyboarder')
    data = { fps: 4, defaultBoardTiming: 2000, boards: [] }
  })
  afterEach(async () => { await fs.remove(folder) })
  const staticBoard = async (uid, color, duration) => {
    const name = `${uid}.png`
    await fs.writeFile(path.join(folder, 'images', name), Buffer.from(colorPng(color).split(',')[1], 'base64'))
    return { uid, url: name, duration, layers: { reference: { url: name, opacity: 1 } } }
  }
  const dynamicBoard = async () => {
    const clip = await renderDynamicBoard({ durationMs: 1000, fps: 4,
      capture: async time => colorPng(time < 500 ? '#ff0000' : '#00ff00') })
    await fs.writeFile(path.join(folder, 'images', 'dynamic-MOVE.mp4'), Buffer.from(clip, 'base64'))
    // This red still is deliberately different from the end of the clip.
    const board = await staticBoard('MOVE', '#ff0000', 1000)
    board.layers = { 'shot-generator': { ...board.layers.reference } }
    board.sg = { data: { motion: { schemaVersion: 1, durationMs: 1000, keyPoints: [] } } }
    return board
  }
  const decode = async file => {
    const result = await execa(ffmpeg, ['-v', 'error', '-i', file, '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { encoding: null, maxBuffer: 10 * 1024 * 1024 })
    const size = 160 * 90 * 4
    const frames = []
    for (let offset = 0; offset < result.stdout.length; offset += size) frames.push(result.stdout.slice(offset, offset + size))
    return frames
  }
  const pixel = (frame, x = 80, y = 45) => Array.from(frame.slice((y * 160 + x) * 4, (y * 160 + x) * 4 + 3))
  const exportBoards = boards => exporter.exportAnimatedGif(boards, { width: 160, height: 90 }, 160, project, false, data, 'missing-watermark.png')

  it('exports the full dynamic clip between static boards with correct timing', async () => {
    const boards = [await staticBoard('START', '#0000ff', 300), await dynamicBoard(), await staticBoard('END', '#ffffff', 700)]
    const output = await exportBoards(boards)
    assert.deepEqual(frameDelays(await fs.readFile(output)), [300, 250, 250, 250, 250, 700])
    const frames = await decode(output)
    assert.equal(frames.length, 6)
    assert(pixel(frames[0])[2] > 200)
    assert(pixel(frames[1])[0] > 200)
    assert(pixel(frames[4])[1] > 200)
    assert(pixel(frames[5]).every(channel => channel > 240))
  })
  it('exports animated top-plan boards using their overhead clips', async () => {
    const board = await dynamicBoard()
    board.sg.data.renderView = 'top-plan'
    const output = await exportBoards([board])
    assert.equal(frameDelays(await fs.readFile(output)).length, 4)
    const frames = await decode(output)
    assert(pixel(frames[0])[0] > 200)
    assert(pixel(frames[frames.length - 1])[1] > 200)
  })

  it('stretches animation to a resized board duration and preserves drawing layers', async () => {
    const board = await dynamicBoard(); board.duration = 2000
    const overlay = document.createElement('canvas'); overlay.width = 160; overlay.height = 90
    const context = overlay.getContext('2d'); context.fillStyle = '#0000ff'; context.fillRect(0, 0, 20, 20)
    await fs.writeFile(path.join(folder, 'images', 'pencil.png'), Buffer.from(overlay.toDataURL().split(',')[1], 'base64'))
    board.layers.pencil = { url: 'pencil.png' }
    const output = await exportBoards([board])
    const delays = frameDelays(await fs.readFile(output))
    assert.equal(delays.length, 8)
    assert.equal(delays.reduce((sum, value) => sum + value, 0), 2000)
    const frames = await decode(output)
    for (const frame of frames) assert(pixel(frame, 5, 5)[2] > 200)
    assert(pixel(frames[0])[0] > 200)
    assert(pixel(frames[frames.length - 1])[1] > 200)
  })
  it('applies dialogue and watermark to every dynamic frame', async () => {
    const board = await dynamicBoard(); board.dialogue = 'Hi'
    const watermark = path.join(folder, 'watermark.png')
    await fs.writeFile(watermark, Buffer.from(colorPng('#0000ff').split(',')[1], 'base64'))
    const output = await exporter.exportAnimatedGif([board], { width: 160, height: 90 }, 160, project, true, data, watermark)
    const frames = await decode(output)
    assert.equal(frames.length, 4)
    for (const frame of frames) {
      assert(pixel(frame, 155, 85)[2] > 200)
      let hasText = false
      for (let y = 20; y < 48; y++) for (let x = 55; x < 105; x++) {
        if (pixel(frame, x, y).every(channel => channel > 200)) hasText = true
      }
      assert(hasText, 'Dialogue must be visible on every frame')
    }
  })

  it('rejects missing dynamic clips and removes incomplete output', async () => {
    const board = await dynamicBoard()
    await fs.remove(path.join(folder, 'images', 'dynamic-MOVE.mp4'))
    await assert.rejects(exportBoards([board]), /Save this dynamic board again/)
    assert.deepEqual(await fs.readdir(path.join(folder, 'exports')), [])
  })
  it('keeps 24fps timing accurate in GIF centiseconds', () => {
    const timing = gifTiming(2000, 24)
    assert.equal(timing.count, 48)
    assert.equal(Array.from({ length: timing.count }, (_, i) => timing.delayAt(i)).reduce((a, b) => a + b, 0), 2000)
    assert.equal(gifTiming(1, 120).delayAt(0), 10)
  })
})
