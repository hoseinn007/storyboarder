# React 18 migration

The app now uses React and React DOM **18.3.1**, with **@react-three/fiber 8.18.0** and **Three.js 0.133.1**. Fiber 8 is the React 18 renderer; Fiber 9 requires React 19. Three.js is pinned to limit changes to the editor's custom rendering code.

## What changed

- All app windows and development views use `react-dom/client` roots through `src/js/utils/react-root.js`. Repeated widget renders reuse their root and preserve state.
- React Redux, React Select, React Window, and XState's React bindings support React 18. Print preview uses `useActor` in place of the removed `useService` hook.
- Framer Motion replaces React Pose and React Reveal for modals and AR fades.
- Fiber's removed `useUpdate` hook lives in `src/js/hooks/use-three-update.js` with the previous effect/ref behavior. Canvas options now use the Fiber 8 API, retaining linear colors, no tone mapping, and a device pixel ratio of 1.
- Selection queries traverse application interaction targets instead of relying on Fiber's removed private `scene.__interaction` array. This includes attachments reparented to bones.
- Custom geometry, transform controls, bitmap text, and IK helpers support Three.js ES classes. Matrix and math helpers use current APIs. Bitmap text retains its upstream MIT license in the adapted source.
- Webpack 4 handles `.mjs` dependencies and lowers modern PeerJS and print-export dependency syntax. The separate server uses Webpack 4.47 to build on Node 18 without an OpenSSL compatibility flag.

Electron remains at 18.0.2. Updating Electron, native modules, and the remaining older dependencies is a separate migration. This is a React 18 upgrade, not a React 19 or full dependency modernization.

## Verification

Build and focused checks were run with Node 18.20.8 and npm 10.8.2. To install and verify:

```sh
npm install
npm --prefix server install
npm run build

npx mocha --require @babel/register \
  test/shot-generator/dynamic-board.test.main.js \
  test/shot-generator/reducers.test.main.js \
  test/shot-generator/top-plan.test.main.js \
  test/shot-generator/top-plans-timeline.test.main.js \
  test/shot-generator/extra-poses.test.main.js

npx electron-mocha --renderer \
  test/shot-generator/react18.renderer.test.js \
  test/shot-generator/pose-picker.renderer.test.js \
  test/shot-generator/dynamic-board.renderer.test.js
```

If the shell sets `ELECTRON_RUN_AS_NODE`, unset it before running Electron or Electron Mocha. Normal dependency resolution no longer needs `--force` or `--legacy-peer-deps`.

The migration tests cover root reuse and cleanup, an interpreted XState service, animated modal opening, real WebGL rendering with custom instanced geometry and outlines, bitmap text, transform controls, and interaction targets after reparenting. The existing authoring tests cover pose selection, dynamic-board editing, playback, undo, persistence, and top-plan export.

Before release, manually exercise representative projects, character posing, camera controls, import/export, printing, and XR/AR on hardware. Packaged distribution/signing and headset/device behavior have not been validated by these automated checks.
