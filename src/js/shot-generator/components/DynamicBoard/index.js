import React, { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { connect } from 'react-redux'
import {
  getMotion, getSceneObjects, getEvaluatedSceneObjects, setBoardMotion,
  setMotionPlayback, setMotionDuration, setMotionEasing, setMotionKey, deleteMotionKey, moveMotionKey
} from '../../../shared/reducers/shot-generator'
import { captureKeyPoint, durationFor, isSupported, easingOptions, easingFor } from '../../../shared/reducers/shot-generator/dynamic-board'

const DynamicBoard = ({ motion, playback, objects, evaluated, board, dispatch, onSave, onInsert, renderView }) => {
  const [collapsed, setCollapsed] = useState(true)
  const panelRef = useRef()
  const gesture = useRef()
  const [layout, setLayout] = useState(null)
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight })
  useLayoutEffect(() => {
    const parent = panelRef.current.parentElement
    const resize = () => {
      const width = parent.clientWidth || window.innerWidth
      const height = parent.clientHeight || window.innerHeight
      setBounds({ width, height })
      setLayout(previous => {
        const w = Math.min(previous ? previous.width : 720, Math.max(120, width - 24))
        const h = Math.min(previous ? previous.height : 300, Math.max(80, height - 24))
        return { width: w, height: h,
          x: Math.max(0, Math.min(previous ? previous.x : 12, width - w - 12)),
          y: Math.max(0, Math.min(previous ? previous.y : height - h - 12, height - h - 12)) }
      })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  const startGesture = mode => event => {
    if (event.button !== 0 || !layout || (mode === 'move' && event.target.closest('button'))) return
    event.preventDefault()
    event.stopPropagation()
    const parent = panelRef.current.parentElement
    const rect = parent.getBoundingClientRect()
    gesture.current = { mode, layout, x: event.clientX, y: event.clientY,
      scaleX: parent.clientWidth && rect.width ? parent.clientWidth / rect.width : 1,
      scaleY: parent.clientHeight && rect.height ? parent.clientHeight / rect.height : 1 }
    if (event.pointerId != null) event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveGesture = event => {
    const active = gesture.current
    if (!active) return
    const dx = (event.clientX - active.x) * active.scaleX
    const dy = (event.clientY - active.y) * active.scaleY
    const next = { ...active.layout }
    if (active.mode === 'move') {
      const visibleWidth = collapsed ? Math.min(250, next.width) : next.width
      const visibleHeight = collapsed ? 46 : next.height
      next.x = Math.max(0, Math.min(bounds.width - visibleWidth, next.x + dx))
      next.y = Math.max(0, Math.min(bounds.height - visibleHeight, next.y + dy))
    } else {
      if (active.mode !== 'height') next.width = Math.max(Math.min(320, bounds.width - next.x), Math.min(bounds.width - next.x, next.width + dx))
      if (active.mode !== 'width') next.height = Math.max(Math.min(140, bounds.height - next.y), Math.min(bounds.height - next.y, next.height + dy))
    }
    setLayout(next)
  }
  const toggle = () => {
    if (collapsed && layout) setLayout({ ...layout,
      x: Math.max(0, Math.min(layout.x, bounds.width - layout.width)),
      y: Math.max(0, Math.min(layout.y, bounds.height - layout.height)) })
    setCollapsed(!collapsed)
  }

  const supported = isSupported(motion)
  const duration = supported ? motion.durationMs : durationFor(board.duration)
  const time = Math.min(playback.timeMs, duration)
  const keys = supported ? motion.keyPoints : []
  useEffect(() => {
    if (!playback.playing) return
    let frame, start
    const tick = now => {
      if (start == null) start = now - time
      const timeMs = Math.min(duration, now - start)
      dispatch(setMotionPlayback({ timeMs, preview: true, playing: timeMs < duration }))
      if (timeMs < duration) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playback.playing, duration, board.uid])
  const seek = value => dispatch(setMotionPlayback({ timeMs: Math.round(Number(value)), preview: true, playing: false }))
  const edit = () => {
    dispatch({ type: 'EDIT_MOTION_FRAME', payload: evaluated })
    dispatch(setMotionPlayback({ preview: false, playing: false }))
  }
  return <section ref={panelRef} className={`dynamic-board${collapsed ? ' dynamic-board--collapsed' : ''}`}
    style={layout ? { left: layout.x, top: layout.y, width: collapsed ? Math.min(250, layout.width) : layout.width,
      height: collapsed ? 46 : layout.height, bottom: 'auto', right: 'auto' } : {}}
    aria-label="Board motion" onKeyDown={event => event.stopPropagation()}
    onPointerMove={moveGesture} onPointerUp={() => { gesture.current = null }} onPointerCancel={() => { gesture.current = null }}>
    <header className="dynamic-board__header" title="Drag to move dynamic settings" onPointerDown={startGesture('move')}>
      <strong>Dynamic settings</strong>
      <button type="button" className="dynamic-board__toggle" aria-expanded={!collapsed}
        aria-controls={`dynamic-settings-${board.uid}`} aria-label={collapsed ? 'Show dynamic settings' : 'Hide dynamic settings'}
        title={collapsed ? 'Show dynamic settings' : 'Hide dynamic settings'} onClick={toggle}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points={collapsed ? '6,15 12,9 18,15' : '6,9 12,15 18,9'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {collapsed ? 'Show' : 'Hide'}
      </button>
    </header>
    <div className="dynamic-board__content" id={`dynamic-settings-${board.uid}`} hidden={collapsed}>
    <div className="dynamic-board__row">
      <label>Board type <select aria-label="Board type" disabled={playback.rendering || (motion && !supported)}
        value={motion ? 'dynamic' : 'static'} onChange={event => {
          dispatch(setBoardMotion(event.target.value === 'dynamic'
            ? { schemaVersion: 1, easing: 'smooth', durationMs: duration, keyPoints: [captureKeyPoint(objects, 0)] } : null))
          dispatch(setMotionPlayback({ timeMs: 0, playing: false, preview: false }))
        }}><option value="static">Static</option><option value="dynamic">Dynamic</option></select></label>
      {motion && <strong>{renderView === 'top-plan' ? 'Top-plan animation' : 'Camera, character + object animation'}</strong>}
      {supported && <label>Animation easing <select aria-label="Animation easing" disabled={playback.rendering}
        value={easingFor(motion.easing)} onChange={event => dispatch(setMotionEasing(event.target.value))}>
        {easingOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>}
      {supported && <label>Duration (s) <input aria-label="Dynamic board duration" type="number" min="0.001" step="0.1"
        value={duration / 1000} onChange={event => {
          if (Number(event.target.value) > 0) dispatch(setMotionDuration(Number(event.target.value) * 1000))
        }} /></label>}
    </div>
    {supported && <div>
      <div className="dynamic-board__row">
        <button disabled={keys.length < 2} onClick={() => dispatch(setMotionPlayback({
          playing: !playback.playing, preview: true, timeMs: time >= duration ? 0 : time
        }))}>{playback.playing ? 'Pause' : 'Preview'}</button>
        <button disabled={playback.preview} onClick={() => dispatch(setMotionKey(captureKeyPoint(objects, time)))}>Set key point</button>
        <button disabled={!playback.preview} onClick={edit}>Edit at this time</button>
        <button disabled={!keys.some(key => key.timeMs === time) || time === 0}
          onClick={() => dispatch(deleteMotionKey(time))}>Delete point</button>
        <button disabled={!playback.preview} onClick={edit}>Return to editing</button>
        <output>{(time / 1000).toFixed(2)} / {(duration / 1000).toFixed(2)} s</output>
      </div>
      <div onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault()
        const from = Number(event.dataTransfer.getData('text/plain'))
        if (!keys.some(key => key.timeMs === from) || !from) return
        const rect = event.currentTarget.getBoundingClientRect()
        const to = Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration)
        dispatch(moveMotionKey({ from, to }))
        seek(Math.max(1, to))
      }}><input aria-label="Dynamic board playhead" type="range" min="0" max={duration} step="1" value={time}
        onChange={event => seek(event.target.value)} /></div>
      <div className="dynamic-board__row dynamic-board__keys">{keys.map(key =>
        <button key={key.timeMs} draggable={key.timeMs !== 0}
          onDragStart={event => event.dataTransfer.setData('text/plain', String(key.timeMs))}
          className={Math.abs(time - key.timeMs) < 1 ? 'selected' : ''}
          onClick={() => seek(key.timeMs)}>◆ {(key.timeMs / 1000).toFixed(2)}s</button>)}</div>
      <small>{playback.preview ? 'Preview: choose Edit at this time to edit positions or character poses at this time.'
        : 'Movement and pose edits save to the current time automatically. Scrub, then Edit at this time to change another point. Drag points onto the ruler to retime.'}</small>
      <div className="dynamic-board__row">
        <button disabled={keys.length < 2} onClick={onSave}>Save dynamic board</button>
        <button disabled={keys.length < 2} onClick={onInsert}>Insert as new dynamic board</button>
        <small>One board in the storyboard timeline. Movement plays automatically.</small>
      </div>
    </div>}
    {motion && !supported && <p>This motion format is newer than this editor. It cannot be edited here.</p>}
    </div>
    {!collapsed && <React.Fragment>
      <div className="dynamic-board__resize-right" title="Resize width" onPointerDown={startGesture('width')}/>
      <div className="dynamic-board__resize-bottom" title="Resize height" onPointerDown={startGesture('height')}/>
      <div className="dynamic-board__resize-corner" title="Drag to resize dynamic settings" onPointerDown={startGesture('both')}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 16L16 6M11 16L16 11" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
      </div>
    </React.Fragment>}
  </section>
}
export default connect(state => ({
  motion: getMotion(state), playback: state.motionPlayback, objects: getSceneObjects(state),
  evaluated: getEvaluatedSceneObjects(state), board: state.board, renderView: state.renderView
}))(DynamicBoard)
