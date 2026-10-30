const path = require('path')
const fs = require('fs')
const os = require('os')
// Run with: env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron test/shot-generator/dynamic-board.smoke.js
const repo = path.resolve(__dirname, '../..')
module.paths.unshift(path.join(repo, 'node_modules'))
const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboarder-motion-smoke-'))
fs.mkdirSync(path.join(profile, 'images'))
// Isolate native export dialogs to test output paths, never a user project.
dialog.showSaveDialog = async (window, options) => ({ canceled: false,
  filePath: path.join(profile, `top-plan.${options.filters[0].extensions[0]}`) })
app.setAppPath(repo)
app.setPath('userData', profile)
const remote = require(path.join(repo, 'node_modules/@electron/remote/main'))
remote.initialize()
let win, settled = false
const finish = (code, message) => {
  if (settled) return
  settled = true
  console.log(message)
  if (win) win.destroy()
  try { require(path.join(repo, 'node_modules/fs-extra')).removeSync(profile) } catch (_) {}
  app.exit(code)
}
ipcMain.on('getCurrentLanguage', event => { event.returnValue = 'en-US' })
ipcMain.on('storyboarder:get-storyboarder-file-data', event => event.sender.send('shot-generator:get-storyboarder-file-data', {
  storyboarderFilePath: path.join(profile, 'smoke.storyboarder'), boardData: { aspectRatio: 2.39, fps: 4, defaultBoardTiming: 500 }
}))
let insertedPlans = []
ipcMain.on('insertShot', async (event, payload) => {
  try {
    if (payload.data.renderView !== 'top-plan') throw new Error('Inserted board lost its overhead output mode')
    const uid = `PLAN${insertedPlans.length + 1}`
    const image = nativeImage.createFromDataURL(payload.images.camera)
    const pixels = image.toBitmap()
    let brightness = 0, samples = 0
    for (let index = 0; index < pixels.length; index += 1600) {
      brightness += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3; samples++
    }
    if (brightness / samples < 200) throw new Error('Inserted image is not a white overhead plan')
    fs.writeFileSync('/tmp/storyboarder-top-plan-board.png', image.toPNG())
    if (payload.data.motion) {
      if (!payload.images.video) throw new Error('Dynamic top plan has no playback clip')
      fs.writeFileSync(path.join(profile, 'images', `dynamic-${uid}.mp4`), Buffer.from(payload.images.video, 'base64'))
    } else {
      if (payload.images.video || payload.currentBoard.duration !== 3500) throw new Error('Static top-plan duration was not retained')
    }
    const board = { uid, duration: payload.data.motion ? payload.data.motion.durationMs : payload.currentBoard.duration,
      fps: 4, sg: { data: payload.data } }
    insertedPlans.push(board)
    event.sender.send('update', { board })
    event.sender.send('shot-generator:save-result', { requestId: payload.requestId })
  } catch (error) { finish(1, error.stack) }
})
ipcMain.on('saveShot', async (event, payload) => {
  try {
    if (!payload.images.video || payload.data.motion.keyPoints.length !== 2) throw new Error('Missing motion or clip')
    if (payload.data.renderView !== 'top-plan') throw new Error('Resaving a top plan switched back to the live camera')
    const first = payload.data.motion.keyPoints[0].objects
    const last = payload.data.motion.keyPoints[1].objects
    const actorId = Object.keys(first).find(id => first[id].type === 'character')
    if (JSON.stringify(first[actorId].pose.skeleton) === JSON.stringify(last[actorId].pose.skeleton)) {
      throw new Error('Rendering overwrote independent poses')
    }
    for (const id of [actorId, 'smoke-box']) {
      if(first[id].visible !== true || last[id].visible !== false) throw new Error('Rendering overwrote keyed visibility')
      if(payload.data.sceneObjects[id].visible !== true) throw new Error('First-point poster visibility was not preserved')
    }
    const clip = path.join(profile, 'images', 'dynamic-SMOKE.mp4')
    fs.writeFileSync(clip, Buffer.from(payload.images.video, 'base64'))
    if (fs.statSync(clip).size < 1000) throw new Error('Empty clip')
    const decoded = await require(path.join(repo, 'node_modules/execa'))(require(path.join(repo, 'node_modules/ffmpeg-static')), ['-v', 'error', '-i', clip, '-f', 'framemd5', '-'])
    const hashes = decoded.stdout.split('\n').filter(line => /^0,/.test(line)).map(line => line.split(',').pop().trim())
    if (hashes.length < 2 || hashes[0] === hashes[hashes.length - 1]) throw new Error('Rendered clip frames did not move')
    event.sender.send('shot-generator:save-result', { requestId: payload.requestId })
    const playback = await win.webContents.executeJavaScript(`(async () => {
      const Player = require(${JSON.stringify(path.join(repo, 'src/js/window/dynamic-board-playback.js'))});
      const container = document.createElement('div'); document.body.appendChild(container);
      const player = new Player(container);
      player.update({uid:'SMOKE',duration:500,sg:{data:{motion:{schemaVersion:1}}}}, {}, ${JSON.stringify(path.join(profile, 'smoke.storyboarder'))}, 250);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const info = {width:player.video.videoWidth,height:player.video.videoHeight,display:player.video.style.display,time:player.video.currentTime};
      player.stop(); return info;
    })()`);
    if (!playback.width || playback.display !== 'block') throw new Error('Storyboard video did not decode: ' + JSON.stringify(playback));
    finish(0, 'PASS: Full Shot Generator saved and storyboard player decoded a dynamic camera/character clip: ' + JSON.stringify(playback))
  } catch (error) { finish(1, error.stack) }
})
setTimeout(() => finish(1, 'FAIL: smoke test timed out'), 45000)
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: false, width: 1505, height: 1080, webPreferences: {
    nodeIntegration: true, contextIsolation: false, webSecurity: false, backgroundThrottling: false
  } })
  remote.enable(win.webContents)
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) console.log('Renderer:', message.slice(0, 800))
  })
  win.webContents.on('render-process-gone', (event, details) => finish(1, JSON.stringify(details)))
  const execute = win.webContents.executeJavaScript.bind(win.webContents)
  win.webContents.executeJavaScript = code => execute(`(async () => { try { return await eval(${JSON.stringify(code)}) } catch (error) { console.error(error.stack); throw error } })()`)
  await win.loadFile(path.join(repo, 'src/shot-generator.html'))
  await win.webContents.executeJavaScript(`window.alert = message => { console.error('SAVE ALERT: ' + message) };
    if (!window.$r) throw new Error('Shot Generator did not initialize');
    const fixture = JSON.parse(require('fs').readFileSync(${JSON.stringify(path.join(repo, 'test/fixtures/shot-generator/shot-generator.storyboarder'))}, 'utf8'));
    const scene = fixture.boards[0].sg.data;
    const animatedObjects = Object.values(scene.sceneObjects).filter(object => ['camera', 'character'].includes(object.type)).reduce((result, object) => { result[object.id] = object; return result }, {});
    window.$r.store.dispatch({type:'SET_META_STORYBOARDER_FILE_PATH',payload:${JSON.stringify(path.join(profile, 'smoke.storyboarder'))}});
    window.$r.store.dispatch({type:'LOAD_SCENE',payload:{...scene,sceneObjects:animatedObjects}});
    window.$r.store.dispatch({type:'SET_BOARD',payload:{uid:'SMOKE',duration:500,fps:4}});
    const capture = require(${JSON.stringify(path.join(repo, 'src/js/shared/reducers/shot-generator/dynamic-board.js'))}).captureKeyPoint;
    const box = {id:'smoke-box',type:'object',model:'box',x:-1,y:0,z:0,width:0.5,height:0.5,depth:0.5,rotation:{x:0,y:0,z:0},visible:true};
    // Create a prop after the initial point to exercise late-target seeding.
    window.$r.store.dispatch({type:'SET_BOARD_MOTION',payload:{schemaVersion:1,durationMs:500,keyPoints:[capture(animatedObjects,0)]}});
    window.$r.store.dispatch({type:'CREATE_OBJECT',payload:box});
    window.$r.store.dispatch({type:'SET_MOTION_PLAYBACK',payload:{timeMs:500,preview:false}});
    for (const object of Object.values(animatedObjects)) {
      window.$r.store.dispatch({type:'UPDATE_OBJECT',payload:{id:object.id,x:object.x+1}});
    }
    window.$r.store.dispatch({type:'UPDATE_OBJECTS',payload:{'smoke-box':{x:1}}});
    const motion = window.$r.store.getState().undoable.present.motion;
    if(motion.keyPoints[0].objects['smoke-box'].x !== -1 || motion.keyPoints[1].objects['smoke-box'].x !== 1) throw new Error('Object points are not independent');
    for(const object of Object.values(animatedObjects)) {
      if(motion.keyPoints[0].objects[object.id].x !== object.x) throw new Error('An earlier character/camera point was changed');
    }
    window.$r.store.dispatch({type:'SET_MOTION_PLAYBACK',payload:{timeMs:0,preview:true}});
  `)
  await new Promise(resolve => setTimeout(resolve, 6000))
  await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(profile, 'shot-generator.png'), image.toPNG()))
  await win.webContents.executeJavaScript(`
    const selectedActor = Object.values(window.$r.store.getState().undoable.present.sceneObjects).find(object=>object.type==='character');
        const evaluate = require(${JSON.stringify(path.join(repo, 'src/js/shared/reducers/shot-generator/dynamic-board.js'))}).evaluateDynamicBoard;
    const current = window.$r.store.getState().undoable.present;
    window.$r.store.dispatch({type:'EDIT_MOTION_FRAME',payload:evaluate(current.sceneObjects,current.motion,500)});
    window.$r.store.dispatch({type:'SET_MOTION_PLAYBACK',payload:{timeMs:500,preview:false}});
    window.$r.store.dispatch({type:'SELECT_OBJECT',payload:selectedActor.id});
    window.firstPoseSnapshot = JSON.stringify(window.$r.store.getState().undoable.present.motion.keyPoints[0].objects[selectedActor.id].pose);
  `)
  await new Promise(resolve => setTimeout(resolve, 300))
  await win.webContents.executeJavaScript(`
    const poseTab = document.querySelectorAll('.tabs-header .tabs-tab')[2];
    if(!poseTab) throw new Error('Pose tab missing'); poseTab.click();
  `)
  await new Promise(resolve => setTimeout(resolve, 800))
  await win.webContents.executeJavaScript(`
    const expand = document.querySelector('[aria-label="Expand pose browser"]');
    if(!expand || expand.disabled) throw new Error('Pose browser is not ready'); expand.click();
  `)
  await new Promise(resolve => setTimeout(resolve, 700))
  await win.webContents.capturePage().then(image => fs.writeFileSync('/tmp/storyboarder-pose-picker.png', image.toPNG()))
  await win.webContents.executeJavaScript(`
    const dialog = document.querySelector('[role="dialog"][aria-label="Choose a pose"]');
    if(!dialog || dialog.getBoundingClientRect().width<600) throw new Error('Pose browser was not expanded');
    const search = dialog.querySelector('[aria-label="Search poses"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'sitting');
    search.dispatchEvent(new Event('input',{bubbles:true}));
  `)
  await new Promise(resolve => setTimeout(resolve, 300))
  await win.webContents.executeJavaScript(`
    const poseItem = document.querySelector('.pose-picker .thumbnail-search__item');
    if(!poseItem) throw new Error('Search returned no selectable poses');
    window.chosenPoseId = poseItem.id;
    poseItem.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  `)
  await new Promise(resolve => setTimeout(resolve, 600))
  await win.webContents.executeJavaScript(`
    const actor = Object.values(window.$r.store.getState().undoable.present.sceneObjects).find(object=>object.type==='character');
    const expectedPose = window.$r.store.getState().presets.poses[window.chosenPoseId].state.skeleton;
    const mismatch = Object.keys(expectedPose).find(name => {
      const actual = actor.skeleton[name];
      return !actual || ['x','y','z'].some(axis=>Math.abs(actual.rotation[axis]-expectedPose[name].rotation[axis])>0.0001);
    });
    if(mismatch) throw new Error('Expanded pose selection was not applied to bone '+mismatch);
    const keys = window.$r.store.getState().undoable.present.motion.keyPoints;
    if(JSON.stringify(keys[0].objects[actor.id].pose)!==window.firstPoseSnapshot) throw new Error('Last pose changed the starting pose');
    if(JSON.stringify(keys[0].objects[actor.id].pose.skeleton)===JSON.stringify(keys[1].objects[actor.id].pose.skeleton)) throw new Error('Poses were not keyed independently');
    const panel = document.querySelector('.dynamic-board');
    const color = getComputedStyle(panel).backgroundColor;
    if(!color.startsWith('rgba(') || Number(color.split(',').pop().replace(')','')) >= 1) throw new Error('Motion controls are not translucent');
    if(!document.querySelector('#camera-view').contains(panel)) throw new Error('Motion controls are not over the viewport');
    if(document.querySelector('[role="dialog"][aria-label="Choose a pose"]')) throw new Error('Pose picker did not close after selection');
    const frame = require(${JSON.stringify(path.join(repo, 'src/js/shared/reducers/shot-generator/dynamic-board.js'))}).evaluateDynamicBoard;
    window.$r.store.dispatch({type:'SET_MOTION_PLAYBACK',payload:{timeMs:0,preview:true}});
    window.$r.store.dispatch({type:'EDIT_MOTION_FRAME',payload:frame(window.$r.store.getState().undoable.present.sceneObjects,window.$r.store.getState().undoable.present.motion,0)});
  `)
  await win.webContents.capturePage().then(image => fs.writeFileSync('/tmp/storyboarder-motion-translucent.png', image.toPNG()))
  await win.webContents.executeJavaScript(`
    const state = window.$r.store.getState().undoable.present;
    const evaluate = require(${JSON.stringify(path.join(repo, 'src/js/shared/reducers/shot-generator/dynamic-board.js'))}).evaluateDynamicBoard;
    const actor = Object.values(state.sceneObjects).find(object => object.type === 'character');
    window.$r.store.dispatch({type:'SET_MOTION_PLAYBACK',payload:{timeMs:500,preview:true}});
    window.$r.store.dispatch({type:'EDIT_MOTION_FRAME',payload:evaluate(state.sceneObjects,state.motion,500)});
    window.$r.store.dispatch({type:'SET_MOTION_PLAYBACK',payload:{preview:false}});
    window.$r.store.dispatch({type:'UPDATE_OBJECT',payload:{id:actor.id,visible:false}});
    window.$r.store.dispatch({type:'UPDATE_OBJECT',payload:{id:'smoke-box',visible:false}});
    window.$r.store.dispatch({type:'SET_MOTION_PLAYBACK',payload:{timeMs:0,preview:true}});
  `)
  for (const format of ['png', 'pdf']) {
    await win.webContents.executeJavaScript(`
      const button = document.querySelector('.top-plan-export-button');
      if(!button) throw new Error('Top-plan export button missing'); button.click();
    `)
    await new Promise(resolve => setTimeout(resolve, 300))
    await win.webContents.executeJavaScript(`
      const select = document.querySelector('[aria-label="Top plan format"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(format)});
      select.dispatchEvent(new Event('change',{bubbles:true}));
    `)
    await win.webContents.executeJavaScript(`
      const dialog = document.querySelector('[role="dialog"][aria-label="Export top plan"]');
      const button = Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent==='Export top plan');
      button.click();
    `)
    const exported = path.join(profile, `top-plan.${format}`)
    const deadline = Date.now() + 10000
    while (!fs.existsSync(exported) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
    if(!fs.existsSync(exported)) {
      const message = await win.webContents.executeJavaScript("document.querySelector('.top-plan-export').innerText");
      throw new Error('Top-plan export did not finish: ' + format + ' ' + message)
    }
    const content = fs.readFileSync(exported)
    if(format==='png' && (content.readUInt32BE(16)!==2400 || content.readUInt32BE(20)!==2680)) throw new Error('Wrong plan PNG dimensions')
    if(format==='pdf' && content.slice(0,5).toString()!=='%PDF-') throw new Error('Wrong plan PDF format')
    fs.copyFileSync(exported,path.join('/tmp',`storyboarder-top-plan.${format}`))
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  console.log('PNG and PDF top-plan exports passed.')
  await win.webContents.executeJavaScript(`
    window.__cropConfirm = window.__cropConfirm || setInterval(() => {
      const dialog = document.querySelector('[aria-label="Crop top plan"]');
      if (dialog) Array.from(dialog.querySelectorAll('button')).find(button => button.textContent === 'Add top plan').click();
    }, 100);
    document.querySelector('.top-plan-insert-button').click()
  `)
  let deadline = Date.now() + 15000
  while (insertedPlans.length < 1 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  if (insertedPlans.length !== 1) throw new Error('Dynamic top plan was not inserted')
  await new Promise(resolve => setTimeout(resolve, 300))
  await win.webContents.executeJavaScript(`
    if(window.$r.store.getState().renderView!=='top-plan' || window.$r.store.getState().mainViewCamera!=='ortho') throw new Error('Inserted top plan did not open in overhead view');
    const board = {...window.$r.store.getState().board, duration:3500, sg:{data:${JSON.stringify(insertedPlans[0].sg.data)}}};
    window.$r.store.dispatch({type:'SET_BOARD',payload:board});
    const select = document.querySelector('[aria-label="Board type"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'static');
    select.dispatchEvent(new Event('change',{bubbles:true}));
  `)
  await win.webContents.executeJavaScript(`
    window.__cropConfirm = window.__cropConfirm || setInterval(() => {
      const dialog = document.querySelector('[aria-label="Crop top plan"]');
      if (dialog) Array.from(dialog.querySelectorAll('button')).find(button => button.textContent === 'Add top plan').click();
    }, 100);
    document.querySelector('.top-plan-insert-button').click()
  `)
  deadline = Date.now() + 10000
  while (insertedPlans.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  if (insertedPlans.length !== 2) throw new Error('Static top plan was not inserted')
  await new Promise(resolve => setTimeout(resolve, 300))
  await win.webContents.executeJavaScript(`
    window.$r.store.dispatch({type:'SET_BOARD',payload:${JSON.stringify(insertedPlans[0])}});
    window.$r.store.dispatch({type:'LOAD_SCENE',payload:${JSON.stringify(insertedPlans[0].sg.data)}});
  `)
  await new Promise(resolve => setTimeout(resolve, 800))
  console.log('Static and dynamic top-plan insertion passed; resaving the animated plan.')
  console.log('Expanded pose search/selection passed; rendering independent camera/character/object points.')
  await win.webContents.executeJavaScript(`const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Save dynamic board'); if(!button) throw new Error('Missing dynamic save control'); button.click();`)
}).catch(error => finish(1, error.stack))
