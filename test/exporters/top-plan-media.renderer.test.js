const assert = require('assert')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { getFilesUsedByProject } = require('../../src/js/exporters/copy-project')
describe('Separate top-plan project media', () => {
  it('includes plan stills and dynamic clips without treating them as storyboard boards', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboarder-plan-media-'))
    try {
      const filename = path.join(folder, 'scene.storyboarder')
      fs.writeJsonSync(filename, { boards: [{ uid: 'camera', url: 'camera.png' }], topPlans: [{
        uid: 'plan', url: 'plan.png', layers: { 'shot-generator': { url: 'plan-shot-generator.png', thumbnail: 'plan-shot-generator-thumbnail.jpg' } },
        sg: { data: { renderView: 'top-plan', sceneObjects: {}, world: { environment: {} }, motion: { schemaVersion: 1 } } }
      }] })
      const files = getFilesUsedByProject(filename)
      assert(files.includes(path.join(folder, 'images', 'plan-shot-generator.png')))
      assert(files.includes(path.join(folder, 'images', 'plan-thumbnail.png')))
      assert(files.includes(path.join(folder, 'images', 'dynamic-plan.mp4')))
      assert(files.includes(path.join(folder, 'images', 'camera-thumbnail.png')))
    } finally { fs.removeSync(folder) }
  })
})
