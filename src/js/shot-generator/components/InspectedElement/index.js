import React, {useEffect, useMemo, useRef, useState} from 'react'
import {connect} from 'react-redux'
import { useTranslation } from 'react-i18next'

import {
  getSelections,
  getSceneObjects,
  updateObject
} from './../../../shared/reducers/shot-generator'

import deepEqualSelector from './../../../utils/deepEqualSelector'

import {Tabs, Tab, Panel} from '../Tabs'

import GeneralInspector from './GeneralInspector/index'
import HandInspector from './HandInspector/HandPresetsEditor/index'
import PosePresetsInspector from './PosePresetsInspector/index'
import ModelInspector from './ModelInspector/index'
import AttachableInspector from './AttachableInspector/index'

import EmotionInspector from './EmotionInspector/index'

import HairInspector from './HairInspector/index'

import Icon from '../Icon'
import Modal from '../Modal'

const isChar = (type) => type === 'character'
const isObj = (type) => type === 'object'
const nullTab = {tab: null, panel: null}

const Inspector = React.memo(({id, selectedName, selectedType, updateObject}) => {
  const { t } = useTranslation()
  const [isModalShown, showModal] = useState(false)
  const [changedName, changeNameTo] = useState('')
  const nameInput = useRef(null)

  useEffect(() => { showModal(false) }, [id])

  useEffect(() => {
    if (!isModalShown) return
    // Focus after Modal's mount effect, which blurs the active element.
    const frame = requestAnimationFrame(() => {
      if (nameInput.current) nameInput.current.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [isModalShown])

  const openRename = (event) => {
    event.preventDefault()
    changeNameTo(selectedName || '')
    showModal(true)
  }

  const saveName = (event) => {
    event.preventDefault()
    const name = changedName.trim()
    if (!name) return
    if (name !== selectedName) updateObject(id, { name })
    showModal(false)
  }

  const renameLabel = t('shot-generator.inspector.inspected-element.rename', 'Rename')
  const handPoseTab = useMemo(() => {
    if (!isChar(selectedType)) return nullTab

    return {
      tab: <Tab><Icon src='icon-tab-hand'/></Tab>,
      panel: <Panel><HandInspector/></Panel>
    }
  }, [selectedType])

  const charPoseTab = useMemo(() => {
    if (!isChar(selectedType)) return nullTab

    return {
      tab: <Tab><Icon src='icon-tab-pose'/></Tab>,
      panel: <Panel><PosePresetsInspector/></Panel>
    }
  }, [selectedType])

  const modelTab = useMemo(() => {
    if (!isChar(selectedType) && !isObj(selectedType)) return nullTab

    return {
      tab: <Tab><Icon src='icon-tab-model'/></Tab>,
      panel: <Panel><ModelInspector/></Panel>
    }
  }, [selectedType])

  const attachmentTab = useMemo(() => {
    if (!isChar(selectedType)) return nullTab

    return {
      tab: <Tab><Icon src='icon-tab-attachable'/></Tab>,
      panel: <Panel><AttachableInspector/></Panel>
    }
  }, [selectedType])

  const emotionsTab = useMemo(() => {
    if (!isChar(selectedType)) return nullTab

    return {
      tab: <Tab><Icon src='icon-tab-emotions'/></Tab>,
      panel: <Panel><EmotionInspector/></Panel>
    }
  }, [selectedType])

  const hairInspectorTab = useMemo(() => {
    if (!isChar(selectedType)) return nullTab

    return {
      tab: <Tab><Icon src='icon-tab-hair'/></Tab>,
      panel: <Panel><HairInspector /></Panel>
    }
  }, [selectedType])


  return (
    <React.Fragment>
      { isModalShown && <Modal visible={ isModalShown } onClose={() => showModal(false)}>
        <form onSubmit={saveName} onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            showModal(false)
          }
        }}>
          <label htmlFor="scene-object-name">{renameLabel}</label>
          <div className="column" style={{ flex: 1 }}>
            <input
              ref={nameInput}
              id="scene-object-name"
              className="modalInput"
              type="text"
              value={changedName}
              onChange={event => changeNameTo(event.currentTarget.value)}
              onFocus={event => event.currentTarget.select()}
            />
          </div>
          <div className="skeleton-selector__div" style={{ gap: 8 }}>
            <button type="button" className="skeleton-selector__button" onClick={() => showModal(false)}>
              {t('shot-generator.inspector.inspected-element.cancel', 'Cancel')}
            </button>
            <button type="submit" className="skeleton-selector__button" disabled={!changedName.trim()}>
              {t('shot-generator.inspector.inspected-element.save', 'Save')}
            </button>
          </div>
        </form>
      </Modal> }
      <div className="object-property-heading object-property-heading--rename">
        <a href="#" onClick={openRename} title={selectedName}>
          {selectedName} {t('shot-generator.inspector.inspected-element.properties')}
        </a>
        <button type="button" className="object-rename-button" onClick={openRename}>
          {renameLabel}
        </button>
      </div>
      <Tabs key={id}>
        <div className="tabs-header">
          <Tab><Icon src="icon-tab-parameters"/></Tab>
          {handPoseTab.tab}
          {charPoseTab.tab}
          {modelTab.tab}
          {attachmentTab.tab}
          {emotionsTab.tab}
          {hairInspectorTab.tab}
        </div>

        <div className="tabs-body">
          <Panel><GeneralInspector/></Panel>
          {handPoseTab.panel}
          {charPoseTab.panel}
          {modelTab.panel}
          {attachmentTab.panel}
          {emotionsTab.panel}
          {hairInspectorTab.panel}
        </div>
      </Tabs>
    </React.Fragment>
  )
})

const getObjectInfo = (state) => {
  const selected = getSelections(state)[0]
  const object = getSceneObjects(state)[selected]

  if (!object) {
    return null
  }

  return {
    id: selected,
    selectedName: object.name || object.displayName,
    selectedType: object.type
  }
}

const getObjectInfoM = deepEqualSelector([getObjectInfo], (info) => info)

const mapStateToProps = (state) => getObjectInfoM(state)

const mapDispatchToProps = {
  updateObject,
}

export default connect(mapStateToProps, mapDispatchToProps)(Inspector)
