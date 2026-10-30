const assert = require('assert')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
const { exportTopPlansPdf } = require('../../src/js/exporters/top-plans-pdf')
describe('Top Plans Timeline PDF', () => {
  let folder, filename, destination
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'top-plans-pdf-'))
    fs.ensureDirSync(path.join(folder, 'images'))
    filename = path.join(folder, 'scene.storyboarder'); destination = path.join(folder, 'plans.pdf')
    const png = fs.readFileSync(path.join(__dirname, '../../build/background.png'))
    fs.writeFileSync(path.join(folder, 'images', 'plan.png'), png)
  })
  afterEach(() => fs.removeSync(folder))
  it('exports only top plans in order with durations and source board labels', async () => {
    const scene = { defaultBoardTiming: 2000, boards: [{ uid: 'camera', shot: '4A', url: 'missing-camera.png' }], topPlans: [
      { uid: 'one', url: 'one.png', duration: 1250, sourceBoardUid: 'camera', layers: { 'shot-generator': { url: 'plan.png' } } },
      { uid: 'two', url: 'two.png', duration: 3500, layers: { 'shot-generator': { url: 'plan.png' } }, sg: { data: { motion: { schemaVersion: 1 } } } }
    ] }
    await exportTopPlansPdf(scene, filename, destination)
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(destination)), disableFontFace: true }).promise
    assert.equal(pdf.numPages, 2)
    const page = await pdf.getPage(1)
    const text = (await page.getTextContent()).items.map(item => item.str).join(' ')
    assert(text.includes('Top plan 1')); assert(text.includes('1.25 seconds')); assert(text.includes('Board 4A'))
    const second = (await (await pdf.getPage(2)).getTextContent()).items.map(item => item.str).join(' ')
    assert(second.includes('3.50 seconds')); assert(second.includes('Dynamic - starting layout'))
    assert(page.view[2] > page.view[3])
    await pdf.destroy()
  })
  it('rejects empty plans and missing media without overwriting an existing PDF', async () => {
    fs.writeFileSync(destination, 'original')
    await assert.rejects(exportTopPlansPdf({ topPlans: [] }, filename, destination), /Add a top plan/)
    await assert.rejects(exportTopPlansPdf({ topPlans: [{ uid: 'missing', url: 'missing.png' }] }, filename, destination), /Save it again/)
    assert.equal(fs.readFileSync(destination, 'utf8'), 'original')
  })
})
