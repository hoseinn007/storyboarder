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
// Keep equal scene numbers in insertion order; older unnumbered plans go last.
const sortBySceneNumber = plans => {
  const number = plan => {
    const details = plan.topPlanDetails || (plan.sg && plan.sg.data && plan.sg.data.topPlanDetails)
    const value = details && Number(details.sceneNumber)
    return Number.isFinite(value) && value > 0 ? value : Infinity
  }
  return plans.sort((a, b) => {
    const left = number(a), right = number(b)
    return left === right ? 0 : left < right ? -1 : 1
  })
}
module.exports = { migrate, sortBySceneNumber }
