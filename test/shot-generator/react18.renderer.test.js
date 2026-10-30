/* global describe it */
require('@babel/register')({ presets: ['@babel/preset-env', '@babel/preset-react'] })
const assert = require('assert')
const React = require('react')
const { act } = React
const THREE = require('three')
const ReactRoot = require('../../src/js/utils/react-root')
const { createRoot, useThree, extend } = require('@react-three/fiber')
extend(THREE)
const useUpdate = require('../../src/js/hooks/use-three-update')
const getSceneInteractions = require('../../src/js/utils/scene-interactions')
const RoundedBox = require('../../src/js/vendor/three-rounded-box')(THREE)
const InstancedMesh = require('../../src/js/vendor/three-instanced-mesh')(THREE)
const createTextGeometry = require('../../src/js/vendor/three-bmfont-text')
const { TransformControls } = require('../../src/js/shared/IK/utils/TransformControls')
const Modal = require('../../src/js/shot-generator/components/Modal').default
const { useActor } = require('@xstate/react')
const { createMachine, interpret } = require('xstate')
const { OutlineEffect } = require('../../src/js/vendor/OutlineEffect')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('React 18 migration', () => {
  it('preserves widget state across renders and releases subscriptions on unmount', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let mounts = 0, cleanups = 0, increment
    const Widget = ({ label }) => {
      const [count, setCount] = React.useState(0)
      increment = () => setCount(value => value + 1)
      React.useEffect(() => { mounts++; return () => { cleanups++ } }, [])
      return React.createElement('span', null, `${label}: ${count}`)
    }
    try {
      act(() => ReactRoot.render(React.createElement(Widget, { label: 'A' }), container))
      act(increment)
      act(() => ReactRoot.render(React.createElement(Widget, { label: 'B' }), container))
      assert.equal(container.textContent, 'B: 1')
      assert.equal(mounts, 1)
      act(() => ReactRoot.unmount(container))
      assert.equal(cleanups, 1)
      act(() => ReactRoot.render(React.createElement(Widget, { label: 'C' }), container))
      assert.equal(container.textContent, 'C: 0')
    } finally {
      act(() => ReactRoot.unmount(container))
      container.remove()
    }
  })

  it('updates interpreted machines and opens the replacement animated modal', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const service = interpret(createMachine({ initial: 'closed', states: {
      closed: { on: { OPEN: 'open' } }, open: {}
    } })).start()
    const View = () => {
      const [state] = useActor(service)
      return React.createElement(Modal, { visible: state.matches('open') }, 'Print preview')
    }
    try {
      await act(async () => ReactRoot.render(React.createElement(View), container))
      assert.equal(container.querySelector('.modal__overlay'), null)
      await act(async () => service.send('OPEN'))
      assert.equal(container.querySelector('.modal__window').textContent, 'Print preview')
    } finally {
      await act(async () => ReactRoot.unmount(container))
      service.stop()
      container.remove()
    }
  })

  it('renders custom editor geometry and discovers reparented interaction targets with Fiber 8', async function () {
    this.timeout(10000)
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    const gl = new THREE.WebGLRenderer({ canvas })
    const root = createRoot(canvas)
    const geometry = new RoundedBox(1, 1, 1, 0.01, 3)
    const material = new THREE.MeshToonMaterial({ color: 0xffffff })
    material.userData.outlineParameters = { thickness: 0.008 }
    const instanced = new InstancedMesh(new THREE.BoxGeometry(), material, 1, true, true, true)
    instanced.setPositionAt(0, new THREE.Vector3(1, 0, 0))
    instanced.setQuaternionAt(0, new THREE.Quaternion())
    instanced.setScaleAt(0, new THREE.Vector3(1, 1, 1))
    instanced.setColorAt(0, new THREE.Color(1, 1, 1))
    instanced.needsUpdate()
    let state, meshRef
    const Scene = () => {
      state = useThree()
      meshRef = useUpdate(mesh => { mesh.userData.initialized = true }, [])
      return React.createElement('group', null,
        React.createElement('ambientLight', { intensity: 1 }),
        React.createElement('mesh', { ref: meshRef, geometry, material, onController: () => null }),
        React.createElement('primitive', { object: instanced }))
    }
    try {
      root.configure({ gl, size: { width: 128, height: 128, top: 0, left: 0 }, frameloop: 'never', linear: true, flat: true })
      await act(async () => { root.render(React.createElement(Scene)) })
      assert(meshRef.current.userData.initialized)
      assert(getSceneInteractions(state.scene).includes(meshRef.current))
      const parent = new THREE.Group()
      state.scene.add(parent)
      parent.attach(meshRef.current)
      assert(getSceneInteractions(state.scene).includes(meshRef.current))
      state.camera.position.z = 5
      const controls = new TransformControls(state.camera, canvas)
      controls.dispose()
      const effect = new OutlineEffect(gl)
      effect.render(state.scene, state.camera)
      assert(gl.info.render.calls > 0)
      for (const program of gl.info.programs) {
        assert(!program.diagnostics || program.diagnostics.runnable, JSON.stringify(program.diagnostics))
      }
      const font = require('parse-bmfont-ascii')(require('fs').readFileSync(require('path').join(__dirname, '../../src/fonts/thicccboi-bmfont/thicccboi-bold.fnt'), 'utf8'))
      const text = createTextGeometry({ font, text: 'Camera 1' })
      text.computeBoundingBox()
      assert(text.attributes.position.count > 0)
      assert(Number.isFinite(text.boundingBox.max.x))
      text.dispose()
    } finally {
      await act(async () => { root.unmount() })
      geometry.dispose()
      material.dispose()
      instanced.geometry.dispose()
      gl.dispose()
      canvas.remove()
    }
  })
})
