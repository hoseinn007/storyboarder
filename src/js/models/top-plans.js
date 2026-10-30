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
module.exports = { migrate }
