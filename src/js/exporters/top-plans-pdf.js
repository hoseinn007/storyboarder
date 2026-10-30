const fs = require('fs-extra')
const path = require('path')
const PDFDocument = require('pdfkit')
const boardModel = require('../models/board')

// Export the independent plan collection, never the storyboard board sequence.
const exportTopPlansPdf = async (scene, sceneFilename, filename) => {
  const plans = scene.topPlans || []
  if (!plans.length) throw new Error('Add a top plan before exporting the Top Plans Timeline.')
  // Read everything before opening the destination, so missing media cannot leave a partial PDF.
  const pages = await Promise.all(plans.map(async plan => {
    const layer = plan.layers && plan.layers['shot-generator']
    const imageFilename = layer && layer.url || boardModel.boardFilenameForPosterFrame(plan)
    try { return await fs.readFile(path.join(path.dirname(sceneFilename), 'images', imageFilename)) }
    catch (error) { throw new Error(`The saved image for top plan ${plan.uid} is missing. Save it again in Shot Generator.`) }
  }))
  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, autoFirstPage: false,
      info: { Title: 'Top Plans Timeline', Creator: 'Storyboarder' } })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk)); doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    try {
      plans.forEach((plan, index) => {
        doc.addPage()
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff')
        const width = doc.page.width - 64
        const source = (scene.boards || []).find(board => board.uid === plan.sourceBoardUid)
        const sourceLabel = source ? source.shot || source.uid : plan.sourceBoardUid
        doc.fillColor('#20242b').fontSize(20).text(`Top plan ${index + 1}`, 32, 28, { width, lineBreak: false })
        doc.fillColor('#626874').fontSize(10).text(
          `${(boardModel.boardDuration(scene, plan) / 1000).toFixed(2)} seconds${sourceLabel ? ` | Board ${sourceLabel}` : ''}${boardModel.isDynamicBoard(plan) ? ' | Dynamic - starting layout' : ''}`,
          32, 57, { width, height: 16, ellipsis: true })
        doc.image(pages[index], 32, 88, { fit: [width, doc.page.height - 142], align: 'center', valign: 'center' })
        doc.fontSize(9).text(`Top Plans Timeline | ${index + 1} / ${plans.length}`, 32, doc.page.height - 48,
          { width, align: 'right', lineBreak: false })
      })
      doc.end()
    } catch (error) { reject(error); doc.destroy() }
  })
  const temporary = filename + '.tmp-' + Date.now()
  try { await fs.writeFile(temporary, buffer); await fs.move(temporary, filename, { overwrite: true }) }
  finally { await fs.remove(temporary) }
  return filename
}
module.exports = { exportTopPlansPdf }
