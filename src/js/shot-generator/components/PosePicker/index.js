import React, { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Modal from '../Modal'
import Grid from '../Grid'

export const filterPoses = (presets, query) => {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return presets.filter(preset => {
    const text = `${preset.name || ''} ${preset.keywords || ''}`.toLowerCase()
    return terms.every(term => text.includes(term))
  })
}

const PosePicker = ({ presets, ItemComponent, itemData, onClose }) => {
  const [query, setQuery] = useState('')
  const [columns, setColumns] = useState(6)
  const gallery = useRef()
  const input = useRef()
  const results = useMemo(() => filterPoses(presets, query), [presets, query])
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (input.current) input.current.focus() })
    const resize = () => {
      if (gallery.current) setColumns(Math.max(1, Math.floor(gallery.current.clientWidth / 122)))
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(gallery.current)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [])
  const keyDown = event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'Tab') {
      const focusable = Array.from(event.currentTarget.querySelectorAll('input, button, [tabindex="0"]'))
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }
  return createPortal(<Modal visible modalClassName="pose-picker" onClose={onClose}>
    <div className="pose-picker__body" role="dialog" aria-modal="true" aria-label="Choose a pose" onKeyDown={keyDown}>
      <div className="pose-picker__header"><h2>Choose a pose</h2><button onClick={onClose} aria-label="Close pose browser">Close</button></div>
      <input ref={input} aria-label="Search poses" type="search" placeholder="Search poses by name or keyword…"
        value={query} onChange={event => setQuery(event.target.value)}/>
      <p aria-live="polite">{results.length} {results.length === 1 ? 'pose' : 'poses'} · Select a thumbnail to apply it</p>
      <div ref={gallery} className="pose-picker__gallery">
        {results.length ? <Grid Component={ItemComponent} elements={results} numCols={columns} itemHeight={202} itemWidth={122}
          itemData={{ ...itemData, imageWidth: 112, imageHeight: 165, itemWidth: 112, itemHeight: 202, presets: results }}/>
          : <p>No poses match your search.</p>}
      </div>
    </div>
  </Modal>, document.body)
}
export default PosePicker
