const fields = [
  ['sceneNumber', 'Scene number', 'number'],
  ['sceneName', 'Scene name', 'text'],
  ['planNumber', 'Plan number', 'number'],
  ['planName', 'Plan name', 'text'],
  ['description', 'Description', 'textarea'],
  ['characterName', 'Character name', 'text'],
  ['planType', 'Plan type', 'select']
]

const chooseTopPlanDetails = (initial = {}, options = {}) => new Promise(resolve => {
  const previousFocus = document.activeElement
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Top plan details')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:10000;display:flex;align-items:center;justify-content:center;-webkit-app-region:no-drag'
  const form = document.createElement('form')
  form.style.cssText = 'background:#292929;color:white;padding:24px;width:400px;max-width:90vw;max-height:90vh;overflow-y:auto'
  const heading = document.createElement('h2')
  heading.textContent = 'Top plan details'
  form.appendChild(heading)
  const inputs = {}
  for (const [key, title, type] of fields) {
    const label = document.createElement('label')
    label.textContent = title
    label.style.cssText = 'display:block;margin:12px 0'
    const input = document.createElement(type === 'textarea' || type === 'select' ? type : 'input')
    if (type === 'select') {
      for (const value of ['static', 'dynamic']) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value === 'static' ? 'Static' : 'Dynamic'
        input.appendChild(option)
      }
    } else if (type === 'textarea') {
      input.rows = 3
    } else input.type = type
    input.required = true
    input.setAttribute('aria-label', title)
    input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-top:5px'
    if (type === 'number') { input.min = '1'; input.step = '1' }
    input.value = initial[key] || (key === 'planType' ? 'static' : '')
    if (key === 'planType' && options.lockPlanType) {
      input.disabled = true
      input.title = 'Change the plan type in Shot Generator to regenerate its saved media.'
    }
    input.oninput = () => input.setCustomValidity('')
    inputs[key] = input
    label.appendChild(input)
    form.appendChild(label)
  }
  const finish = result => {
    overlay.remove()
    if (previousFocus && previousFocus.isConnected) previousFocus.focus()
    resolve(result)
  }
  const cancel = document.createElement('button')
  cancel.type = 'button'; cancel.textContent = 'Cancel'
  cancel.onclick = () => finish(null)
  const submit = document.createElement('button')
  submit.type = 'submit'; submit.textContent = options.submitLabel || 'Continue to crop'
  form.appendChild(cancel); form.appendChild(submit)
  form.onsubmit = event => {
    event.preventDefault()
    const details = {}
    for (const [key] of fields) {
      details[key] = inputs[key].value.trim()
      inputs[key].setCustomValidity(details[key] ? '' : 'Please enter a value.')
    }
    if (form.reportValidity()) finish(details)
  }
  overlay.onkeydown = event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); finish(null) }
    if (event.key === 'Tab') {
      const controls = [...Object.values(inputs), cancel, submit]
      const index = controls.indexOf(document.activeElement)
      if (event.shiftKey && index === 0) { event.preventDefault(); submit.focus() }
      else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus() }
    }
  }
  overlay.appendChild(form)
  document.body.appendChild(overlay)
  inputs.sceneNumber.focus()
})

module.exports = { chooseTopPlanDetails }
