const assert = require('assert')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const parseXml = require('util').promisify(require('xml2js').parseString)
const { exportTopPlansExcel } = require('../../src/js/exporters/top-plans-excel')

describe('Top plans Excel shot list', () => {
  let folder, destination
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'top-plans-excel-'))
    destination = path.join(folder, 'shot-list.xlsx')
  })
  afterEach(() => fs.removeSync(folder))
  it('exports sorted top plans, Unicode characters, numeric durations, and literal text without changing the scene', async () => {
    const plan = (sceneNumber, planNumber, description) => ({ topPlanDetails: {
      sceneNumber, planNumber, description, characterName: 'شیما & صدرا', sceneName: 'Kitchen', planName: 'Entrance', planType: 'dynamic',
      cameraHeight: '0', lens: '35.25'
    }, duration: 1250 })
    const scene = { boards: [plan('1', '1', 'camera-only')], topPlans: [
      plan('10', '1', 'later'), plan('2', '10', 'ten'), plan('2', '2', '=SUM(A1:A2) <test>')
    ] }
    scene.topPlans.push({ sg: { data: { topPlanDetails: { sceneNumber: '3', planNumber: '1', characterName: 'Father' } } } })
    const original = JSON.stringify(scene)
    await exportTopPlansExcel(scene, destination)
    assert.equal(JSON.stringify(scene), original)
    const zip = await JSZip.loadAsync(fs.readFileSync(destination))
    for (const name of Object.keys(zip.files).filter(name => /\.xml$|\.rels$/.test(name))) {
      await parseXml(await zip.file(name).async('string'))
    }
    const sheet = (await parseXml(await zip.file('xl/worksheets/sheet1.xml').async('string'))).worksheet
    const rows = sheet.sheetData[0].row
    const value = cell => cell.v ? Number(cell.v[0]) : cell.is[0].t[0]._ || cell.is[0].t[0]
    assert.equal(value(rows[0].c[0]), 'شماره صحنه')
    assert.equal(value(rows[0].c[5]), 'شخصیت')
    assert.equal(value(rows[1].c[6]), 'متحرک')
    assert.equal(sheet.sheetViews[0].sheetView[0].$.rightToLeft, '1')
    assert.deepStrictEqual(rows.slice(1).map(row => [value(row.c[0]), value(row.c[2])]), [[2, 2], [2, 10], [3, 1], [10, 1]])
    assert.equal(value(rows[1].c[5]), 'شیما & صدرا')
    assert.equal(value(rows[1].c[4]), '=SUM(A1:A2) <test>')
    assert.equal(rows[1].c[4].f, undefined)
    assert.equal(value(rows[1].c[7]), 1.25)
    assert.equal(value(rows[1].c[12]), 0)
    assert.equal(value(rows[1].c[13]), 35.25)
    assert.equal(rows[1].c[12].$.t, undefined)
    assert.equal(rows[1].c[13].$.t, undefined)
    assert.equal(rows[3].c[12].is[0].t[0]._, undefined)
    assert.equal(rows[3].c[13].is[0].t[0]._, undefined)
    assert.equal(value(rows[3].c[5]), 'Father')
    assert.equal(sheet.autoFilter[0].$.ref, 'A1:Q5')
    assert.equal(sheet.sheetViews[0].sheetView[0].pane[0].$.state, 'frozen')
    assert(!(await zip.file('xl/worksheets/sheet1.xml').async('string')).includes('camera-only'))
  })
  it('rejects an empty collection without overwriting a destination', async () => {
    fs.writeFileSync(destination, 'original')
    await assert.rejects(exportTopPlansExcel({ boards: [] }, destination), /Add a top plan/)
    assert.equal(fs.readFileSync(destination, 'utf8'), 'original')
  })
})
