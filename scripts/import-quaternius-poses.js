// Usage: node scripts/import-quaternius-poses.js source.gltf source.bin
// Source is pinned and documented in docs/extra-poses.md. No new runtime dependencies.
const fs = require('fs')
const crypto = require('crypto')
const THREE = require('three')
const path = require('path')
const root = path.resolve(__dirname, '..')
const source = JSON.parse(fs.readFileSync(process.argv[2]))
const buffer = fs.readFileSync(process.argv[3])
const glb = fs.readFileSync(path.join(root, 'src/data/shot-generator/dummies/gltf/adult-male.glb'))
const target = JSON.parse(glb.slice(20, 20 + glb.readUInt32LE(12)))
const map = { 'DEF-hips': 'Hips', 'DEF-spine.001': 'Spine', 'DEF-spine.002': 'Spine1', 'DEF-spine.003': 'Spine2', 'DEF-neck': 'Neck', 'DEF-head': 'Head' }
for (const [suffix, side] of [['L', 'Left'], ['R', 'Right']]) {
  for (const [from, to] of Object.entries({ shoulder: 'Shoulder', upper_arm: 'Arm', forearm: 'ForeArm', hand: 'Hand', thigh: 'UpLeg', shin: 'Leg', foot: 'Foot', toe: 'ToeBase' })) map[`DEF-${from}.${suffix}`] = side + to
}
const rig = json => {
  const nodes = json.nodes.map(n => {
    const o = new THREE.Object3D(); o.name = n.name
    if (n.translation) o.position.fromArray(n.translation)
    if (n.rotation) o.quaternion.fromArray(n.rotation)
    if (n.scale) o.scale.fromArray(n.scale)
    return o
  })
  json.nodes.forEach((n, i) => (n.children || []).forEach(child => nodes[i].add(nodes[child])))
  const scene = new THREE.Group(); nodes.filter(n => !n.parent).forEach(n => scene.add(n)); scene.updateMatrixWorld(true)
  return { nodes, scene }
}
const src = rig(source), dst = rig(target)
const names = Object.fromEntries(dst.nodes.map(n => [n.name, n]))
const read = index => {
  const a = source.accessors[index], view = source.bufferViews[a.bufferView]
  if (a.componentType !== 5126 || view.byteStride) throw new Error('Expected tightly packed float accessor')
  const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]
  const offset = (view.byteOffset || 0) + (a.byteOffset || 0)
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: size }, (_, c) => buffer.readFloatLE(offset + (i * size + c) * 4)))
}
const rests = src.nodes.map(n => n.quaternion.clone())
const sample = (clip, phase) => {
  src.nodes.forEach((n, i) => n.quaternion.copy(rests[i]))
  for (const channel of clip.channels) {
    if (channel.target.path !== 'rotation') continue
    const sampler = clip.samplers[channel.sampler], times = read(sampler.input).map(v => v[0]), values = read(sampler.output)
    const time = times[0] + phase * (times[times.length - 1] - times[0])
    let i = 0; while (i + 1 < times.length && times[i + 1] <= time) i++
    const q = new THREE.Quaternion().fromArray(values[i])
    if (sampler.interpolation === 'LINEAR' && i + 1 < times.length) q.slerp(new THREE.Quaternion().fromArray(values[i + 1]), (time - times[i]) / (times[i + 1] - times[i]))
    src.nodes[channel.target.node].quaternion.copy(q)
  }
  src.scene.updateMatrixWorld(true)
}
// Both files use Y-up, +Z forward. Use world-space bind deltas to account
// for different local bone axes, then solve target locals in hierarchy order.
const worldQ = n => n.getWorldQuaternion(new THREE.Quaternion())
const sourceRest = src.nodes.map(worldQ)
const targetRest = Object.fromEntries(dst.nodes.map(n => [n.name, worldQ(n)]))
const pairs = src.nodes.map((n, i) => ({ i, target: names[map[n.name]] })).filter(p => p.target)
const depth = n => n.parent ? 1 + depth(n.parent) : 0
pairs.sort((a, b) => depth(a.target) - depth(b.target))
const presets = {}
const seen = new Set()
const excluded = new Set(['A_TPose', 'Roll_RM', 'Sword_Attack_RM', 'Sitting_Enter', 'Sitting_Exit', 'Death01'])
for (const clip of source.animations.filter(a => !excluded.has(a.name))) {
  for (const [label, phase] of [['A', .25], ['B', .65]]) {
    sample(clip, phase)
    const skeleton = {}
    for (const { i, target: bone } of pairs) {
      const desired = worldQ(src.nodes[i]).multiply(sourceRest[i].clone().inverse()).multiply(targetRest[bone.name])
      bone.quaternion.copy(worldQ(bone.parent).inverse().multiply(desired).normalize())
      bone.updateMatrixWorld(true)
      const e = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ')
      skeleton[bone.name] = { rotation: { x: e.x, y: e.y, z: e.z } }
    }
    const signature = JSON.stringify(skeleton)
    if (seen.has(signature)) continue
    seen.add(signature)
    const id = 'QTR-' + crypto.createHash('sha256').update(clip.name + ':' + label).digest('hex').slice(0, 20).toUpperCase()
    const title = clip.name.replace(/_Loop$/, '').replace(/_/g, ' ')
    presets[id] = { id, name: `Q - ${title} ${label}`, keywords: `quaternius extra ${title.toLowerCase()} ${/Fwd|Walk|Jog|Sprint/.test(clip.name) ? 'movement walking running' : ''}`, state: { skeleton }, source: { author: 'Quaternius', license: 'CC0-1.0', clip: clip.name, phase } }
  }
}
fs.writeFileSync(path.join(root, 'src/js/shared/reducers/shot-generator-presets/quaternius-poses.json'), JSON.stringify(presets, null, 2) + '\n')
console.log(`Imported ${Object.keys(presets).length} pose presets`)
