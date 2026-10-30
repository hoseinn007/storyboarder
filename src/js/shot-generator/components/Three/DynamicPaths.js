import React, { useMemo, useEffect } from 'react'
import { connect } from 'react-redux'
import * as THREE from 'three'
import { getMotion, getSceneObjects } from '../../../shared/reducers/shot-generator'

const MotionLine = ({ points, type }) => {
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(
    points.map(point => new THREE.Vector3(point.x, point.z + 0.03, point.y))), [points])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <line geometry={geometry} raycast={() => {}}>
    <lineBasicMaterial attach="material" color={type === 'camera' ? '#289bea' : type === 'character' ? '#e7a438' : '#a688e7'} depthTest={false}/>
  </line>
}
const DynamicPaths = ({ motion, objects }) => {
  if (!motion || motion.schemaVersion !== 1 || motion.keyPoints.length < 2) return null
  return <group userData={{ planPaths: true }}>{Object.values(objects).filter(object => ['camera', 'character', 'object'].includes(object.type)).map(object => {
    const points = motion.keyPoints.map(key => key.objects[object.id]).filter(Boolean)
    return points.length > 1 ? <MotionLine key={object.id} points={points} type={object.type}/> : null
  })}</group>
}
export default connect(state => ({ motion: getMotion(state), objects: getSceneObjects(state) }))(DynamicPaths)
