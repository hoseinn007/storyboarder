const assert = require('assert')
const { migrate, sortBySceneNumber } = require('../../src/js/models/top-plans')
describe('Separate top plans collection', () => {
  it('sorts scene numbers numerically, preserves ties and places unnumbered plans last', () => {
    const numbered = (uid, sceneNumber) => ({ uid, topPlanDetails: { sceneNumber } })
    const plans = [{ uid: 'legacy' }, numbered('ten', '10'), numbered('two', '2'),
      numbered('two-again', '2'), { uid: 'one', sg: { data: { topPlanDetails: { sceneNumber: '1' } } } },
      numbered('invalid', 'abc')]
    sortBySceneNumber(plans)
    assert.deepStrictEqual(plans.map(plan => plan.uid), ['one', 'two', 'two-again', 'ten', 'legacy', 'invalid'])
  })
  const plan = uid => ({ uid, url: `${uid}.png`, sg: { data: { renderView: 'top-plan' } } })
  it('moves inline plans without changing camera boards, media names, duration, or key points', () => {
    const camera = { uid: 'camera' }
    const overhead = { ...plan('plan'), duration: 3500 }
    const scene = { boards: [camera, overhead] }
    assert(migrate(scene))
    assert.deepStrictEqual(scene.boards, [camera])
    assert.strictEqual(scene.topPlans[0], overhead)
    assert.strictEqual(migrate(scene), false)
    assert.deepStrictEqual(JSON.parse(JSON.stringify(scene)).topPlans, [overhead])
  })
  it('preserves existing plans and avoids duplicate identities during migration', () => {
    const existing = plan('one')
    const scene = { boards: [plan('one'), plan('two')], topPlans: [existing] }
    migrate(scene)
    assert.deepStrictEqual(scene.topPlans.map(p => p.uid), ['one', 'two'])
    assert.strictEqual(scene.topPlans[0], existing)
    assert.deepStrictEqual(scene.boards, [])
  })
  it('leaves existing camera-only projects unchanged', () => {
    const scene = { boards: [{ uid: 'camera' }] }
    assert.strictEqual(migrate(scene), false)
    assert.strictEqual(scene.topPlans, undefined)
  })
})
