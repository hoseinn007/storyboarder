module.exports = (plan, index) => {
  const details = plan.topPlanDetails || (plan.sg && plan.sg.data && plan.sg.data.topPlanDetails)
  if (!details) return `Top plan ${index + 1}`
  const scene = `Scene ${details.sceneNumber}: ${details.sceneName}`
  return details.planNumber && details.planName
    ? `${scene} — Plan ${details.planNumber}: ${details.planName}`
    : scene
}
