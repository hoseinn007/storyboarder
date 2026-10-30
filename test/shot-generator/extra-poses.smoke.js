// env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron test/shot-generator/extra-poses.smoke.js
const path = require('path'), fs = require('fs-extra'), os = require('os')
const { app, BrowserWindow, ipcMain } = require('electron')
const repo = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboarder-extra-poses-'))
app.setAppPath(repo); app.setPath('userData', profile)
const remote = require('@electron/remote/main'); remote.initialize()
ipcMain.on('getCurrentLanguage', event => { event.returnValue = 'en-US' })
let win
const finish = (code, message) => { console.log(message); if (win) win.destroy(); fs.removeSync(profile); app.exit(code) }
setTimeout(() => finish(1, 'Timed out'), 45000)
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: false, width: 1505, height: 1080, webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false, backgroundThrottling: false } })
  remote.enable(win.webContents)
  win.webContents.on('console-message', (event, level, message) => { if (level >= 2) console.log(message) })
  await win.loadFile(path.join(repo, 'src/shot-generator.html'))
  await win.webContents.executeJavaScript(`
    const fixture = JSON.parse(require('fs').readFileSync(${JSON.stringify(path.join(repo, 'test/fixtures/shot-generator/shot-generator.storyboarder'))}));
    window.$r.store.dispatch({type:'LOAD_SCENE',payload:fixture.boards[0].sg.data});
    const actor = Object.values(window.$r.store.getState().undoable.present.sceneObjects).find(o=>o.type==='character');
    window.__extraActor=actor.id;
    window.$r.store.dispatch({type:'SELECT_OBJECT',payload:actor.id});
    const poses = Object.values(window.$r.store.getState().presets.poses).filter(p=>p.source && p.source.author==='Quaternius');
    if(poses.length!==151) throw new Error('Missing imported presets: '+poses.length);
  `)
  await new Promise(resolve => setTimeout(resolve, 5000))
  for (const term of ['Driving C', 'Crouch Idle D', 'Idle Talking C', 'Pistol Shoot D']) {
    await win.webContents.executeJavaScript(`(() => {
      const pose=Object.values(window.$r.store.getState().presets.poses).find(p=>p.name.includes(${JSON.stringify(term)}));
      if(!pose) throw new Error('Missing pose');
      window.$r.store.dispatch({type:'UPDATE_OBJECT',payload:{id:window.__extraActor,skeleton:pose.state.skeleton,posePresetId:pose.id}});
    })()`)
    await new Promise(resolve => setTimeout(resolve, 600))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(os.tmpdir(), 'storyboarder-extra-' + term.replace(/ /g, '-') + '.png'), image.toPNG())
  }
  finish(0, 'PASS: 151 imported poses loaded; four representative poses rendered in Shot Generator.')
}).catch(error => finish(1, error.stack))
