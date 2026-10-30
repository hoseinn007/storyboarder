module.exports = (plan, index) => {
  const details = plan.topPlanDetails || (plan.sg && plan.sg.data && plan.sg.data.topPlanDetails)
  if (!details) return `Top plan ${index + 1}`
  return `Scene ${details.sceneNumber}: ${details.sceneName}`
}
