const fs = require('fs-extra')
const JSZip = require('jszip')
const boardModel = require('../models/board')
const { sortBySceneNumber } = require('../models/top-plans')

// Write a small, standard OOXML workbook.
// Inline strings preserve Unicode and prevent user text from becoming formulas.
const xml = value => String(value == null ? '' : value)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const headers = ['شماره صحنه', 'نام صحنه', 'شماره پلان', 'نام پلان', 'توضیحات',
  'شخصیت', 'نوع پلان', 'زمان نما (ثانیه)', 'ترتیب برداشت', 'محل فیلم‌برداری',
  'زمان فیلم‌برداری', 'سختی برداشت', 'ارتفاع دوربین (متر)', 'لنز (میلی‌متر)', 'نکات', 'ملاحظات', 'برداشت شد؟']
const widths = [15, 24, 15, 24, 55, 28, 15, 20, 18, 24, 18, 22, 18, 15, 30, 30, 20]
const positiveNumber = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : value || ''
const measurement = value => value == null || String(value).trim() === '' ? '' :
  Number.isFinite(Number(value)) ? Number(value) : value

const exportTopPlansExcel = async (scene, filename) => {
  const plans = sortBySceneNumber([...(scene.topPlans || [])])
  if (!plans.length) throw new Error('Add a top plan before exporting the shot list.')
  const rows = [headers, ...plans.map(plan => {
    const details = plan.topPlanDetails || (plan.sg && plan.sg.data && plan.sg.data.topPlanDetails) || {}
    const type = details.planType || (boardModel.isDynamicBoard(plan) ? 'dynamic' : 'static')
    return [positiveNumber(details.sceneNumber), details.sceneName, positiveNumber(details.planNumber),
      details.planName, details.description, details.characterName,
      type === 'dynamic' ? 'متحرک' : 'ثابت', boardModel.boardDuration(scene, plan) / 1000,
      '', '', '', '', measurement(details.cameraHeight), measurement(details.lens), '', '', '']
  })]
  const data = rows.map((row, index) => `<row r="${index + 1}" ht="${index ? 48 : 32}" customHeight="1">${row.map((value, column) => {
    const ref = String.fromCharCode(65 + column) + (index + 1)
    const style = index === 0 ? 1 : index % 2 ? 2 : 3
    return typeof value === 'number' && Number.isFinite(value)
      ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
      : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
  }).join('')}</row>`).join('')
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="شات لیست" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0F8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2" vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" readingOrder="2" vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><dimension ref="A1:Q${rows.length}"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:Q${rows.length}"/><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape"/></worksheet>`
  }
  const archive = new JSZip()
  for (const [name, content] of Object.entries(files)) archive.file(name, content)
  const buffer = await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const temporary = filename + '.tmp-' + Date.now()
  try { await fs.writeFile(temporary, buffer); await fs.move(temporary, filename, { overwrite: true }) }
  finally { await fs.remove(temporary) }
  return filename
}

module.exports = { exportTopPlansExcel }
