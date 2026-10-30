import React, { useState } from 'react'
import { useStore } from 'react-redux'
import { createPortal } from 'react-dom'
import path from 'path'
import Modal from '../Modal'
import { getEvaluatedSceneObjects, getWorld, getMotion, setMotionPlayback } from '../../../shared/reducers/shot-generator'
import { renderTopPlan, writeTopPlan } from '../../services/top-plan'
const remote = require('@electron/remote')

const TopPlanExport = ({ canvasData, onClose }) => {
  const store = useStore()
  const [format, setFormat] = useState('png')
  const [includePaths, setIncludePaths] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const exportPlan = async () => {
    setBusy(true); setError('')
    let completed = false
    try {
      store.dispatch(setMotionPlayback({ playing: false }))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const state = store.getState()
      const data = canvasData.current
      const png = renderTopPlan({ scene: data.scene, camera: data.camera, includePaths,
        state: { objects: getEvaluatedSceneObjects(state), world: getWorld(state), motion: getMotion(state),
          board: state.board, preview: state.motionPlayback.preview, timeMs: state.motionPlayback.timeMs } })
      const label = String(state.board.shot || state.board.uid || 'shot').replace(/[<>:"/\\|?*]/g, '-')
      const folder = state.meta.storyboarderFilePath ? path.dirname(state.meta.storyboarderFilePath) : remote.app.getPath('documents')
      const { canceled, filePath } = await remote.dialog.showSaveDialog(remote.getCurrentWindow(), {
        title: 'Export top plan', defaultPath: path.join(folder, `${label}-top-plan.${format}`),
        filters: [{ name: format === 'pdf' ? 'PDF document' : 'PNG image', extensions: [format] }]
      })
      if (canceled || !filePath) return
      const destination = path.extname(filePath).toLowerCase() === `.${format}` ? filePath : `${filePath}.${format}`
      await writeTopPlan(destination, format, png, `Top plan — ${label}`)
      completed = true
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
    if (completed) onClose()
  }
  const hasPaths = !!getMotion(store.getState())
  return createPortal(<Modal visible onClose={busy ? () => {} : onClose} modalClassName="top-plan-export">
    <div role="dialog" aria-modal="true" aria-label="Export top plan" onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape' && !busy) onClose()
    }}>
      <h2>Export top plan</h2>
      <p>Export the current overhead layout with a shot title and meter scale bar.</p>
      <label>Format <select aria-label="Top plan format" value={format} disabled={busy} onChange={event => setFormat(event.target.value)}>
        <option value="png">PNG image</option><option value="pdf">PDF document</option>
      </select></label>
      {hasPaths && <label className="top-plan-export__paths"><input type="checkbox" checked={includePaths} disabled={busy}
        onChange={event => setIncludePaths(event.target.checked)}/> Include all movement paths</label>}
      <p>Object positions and visibility use the current frame. Playback pauses for export.</p>
      {error && <p role="alert">{error}</p>}
      <div className="top-plan-export__actions">
        <button disabled={busy} onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={exportPlan}>{busy ? 'Exporting…' : 'Export top plan'}</button>
      </div>
    </div>
  </Modal>, document.body)
}
export default TopPlanExport
