// Keep original preset identities and add separately attributed internet poses.
module.exports = {
  ...require('./poses.json'),
  ...require('./quaternius-poses.json')
}
