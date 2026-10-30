const { isTopPlanBoard } = require('./board')

// Preserve media filenames and identities when separating older inline plans.
const migrate = scene => {
  const plans = scene.topPlans || []
  const inline = scene.boards.filter(isTopPlanBoard)
  if (!inline.length) return false
  const ids = new Set(plans.map(plan => plan.uid))
  scene.topPlans = plans.concat(inline.filter(plan => !ids.has(plan.uid)))
  scene.boards = scene.boards.filter(board => !isTopPlanBoard(board))
  return true
}
// Sort numerically by scene, then plan; missing numbers go last and ties stay stable.
const sortBySceneNumber = plans => {
  const number = (plan, key) => {
    const details = plan.topPlanDetails || (plan.sg && plan.sg.data && plan.sg.data.topPlanDetails)
    const value = details && Number(details[key])
    return Number.isFinite(value) && value > 0 ? value : Infinity
  }
  return plans.sort((a, b) => {
    for (const key of ['sceneNumber', 'planNumber']) {
      const left = number(a, key), right = number(b, key)
      if (left !== right) return left < right ? -1 : 1
    }
    return 0
  })
}
module.exports = { migrate, sortBySceneNumber }
