const { useEffect, useRef } = require('react')
const { useThree } = require('@react-three/fiber')

// Fiber 8 removed useUpdate. Keep the editor's imperative object setup in an
// effect, with the same dependency/ref behavior as the previous renderer.
module.exports = function useThreeUpdate(callback, dependencies, optionalRef) {
  const invalidate = useThree(state => state.invalidate)
  const localRef = useRef()
  const ref = optionalRef || localRef
  useEffect(() => {
    if (ref.current) {
      callback(ref.current)
      invalidate()
    }
  }, dependencies)
  return ref
}
