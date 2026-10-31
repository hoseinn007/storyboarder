// Accept Persian and Arabic-Indic digits wherever users enter numbers.
const normalizeDigits = value => value.replace(/[۰-۹٠-٩]/g, digit =>
  String(digit.charCodeAt(0) - (digit <= '٩' ? 0x0660 : 0x06f0)))
  .replace(/٫/g, '.')

module.exports = normalizeDigits
