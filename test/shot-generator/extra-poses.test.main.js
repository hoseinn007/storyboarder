const assert = require('assert')
const THREE = require('three')
const poses = require('../../src/js/shared/reducers/shot-generator-presets/poses')
const original = require('../../src/js/shared/reducers/shot-generator-presets/poses.json')
const extra = require('../../src/js/shared/reducers/shot-generator-presets/quaternius-poses.json')
const { captureKeyPoint, evaluateDynamicBoard } = require('../../src/js/shared/reducers/shot-generator/dynamic-board')
describe('Internet pose library', () => {
  it('adds 77 distinct searchable poses and preserves all original presets', () => {
    assert.equal(Object.keys(extra).length, 77)
    assert.equal(Object.keys(poses).length, Object.keys(original).length + 77)
    for (const [id, preset] of Object.entries(original)) assert.strictEqual(poses[id], preset)
    for (const [id, preset] of Object.entries(extra)) {
      assert.equal(preset.id, id); assert(preset.keywords.includes('quaternius'))
      assert.equal(preset.source.license, 'CC0-1.0')
      assert(Object.keys(preset.state.skeleton).length >= 20)
      for (const bone of Object.values(preset.state.skeleton)) {
        assert(Object.values(bone.rotation).every(Number.isFinite))
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(bone.rotation.x, bone.rotation.y, bone.rotation.z))
        assert(Math.abs(q.length() - 1) < 1e-6)
      }
    }
    assert.equal(new Set(Object.values(extra).map(p => JSON.stringify(p.state.skeleton))).size, 77)
  })
  it('preserves imported poses independently in dynamic-board key points', () => {
    const list = Object.values(extra)
    const actor = index => ({ id: 'actor', type: 'character', model: 'adult-male', x: 0, y: 0, z: 0,
      rotation: 0, skeleton: list[index].state.skeleton, posePresetId: list[index].id })
    const motion = { schemaVersion: 1, durationMs: 1000, keyPoints: [captureKeyPoint({actor:actor(0)}, 0), captureKeyPoint({actor:actor(1)}, 1000)] }
    const evaluated = evaluateDynamicBoard({actor:actor(0)}, motion, 500)
    assert(evaluated.actor.skeleton)
    assert.deepStrictEqual(motion.keyPoints[0].objects.actor.pose.skeleton, list[0].state.skeleton)
    assert.notDeepStrictEqual(motion.keyPoints[0].objects.actor.pose.skeleton, motion.keyPoints[1].objects.actor.pose.skeleton)
  })
})
