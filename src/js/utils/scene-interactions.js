// Interaction targets belong to the editor, rather than Fiber's private event
// registry. Traverse the scene so reparented attachments remain discoverable.
module.exports = function getSceneInteractions(scene) {
  const targets = []
  scene.traverse(object => {
    if (typeof object.onController === 'function' || object.userData.type === 'attachable') {
      targets.push(object)
    }
  })
  return targets
}
