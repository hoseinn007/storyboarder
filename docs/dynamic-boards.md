# Dynamic storyboard boards

A dynamic board is one storyboard timeline item with camera, character, and object movement inside its duration. Existing boards remain static until **Board type → Dynamic** is selected in Shot Generator.

## Using it

1. Open or create a board in Shot Generator.
2. Select **Dynamic** and set its duration. The starting point at 0 seconds is captured automatically.
3. Scrub to a later time and choose **Edit at this time**.
4. Move the camera with the existing controls: pan, tilt, roll, horizontal movement (rail/dolly), height (pedestal), or lens. Move characters and objects in either the 3D view or overhead view.
5. Transform, visibility, and pose edits automatically record the changed camera, character, or object at the current time. **Set key point** is also available to capture the entire frame explicitly. Earlier points keep their own transforms, including for actors or objects created after the first point.
6. Repeat for other times. Click a point to inspect it, or drag a point onto the ruler to retime it. The starting point remains at zero. Duration cannot be shortened past the last point.
7. Choose **Preview** to play the movement inside Shot Generator.
8. Choose **Save dynamic board** to update the current board, or **Insert as new dynamic board** to add another timeline item. Saving requires at least two points and renders a playback clip. A progress overlay allows cancellation.
9. Play the normal storyboard timeline. Dynamic boards play their movement automatically, and static boards display as usual. The timeline labels dynamic items with `▶ Dynamic`.

The overhead view shows blue camera paths, amber character paths, and purple object paths. These connect the key points; they are not separate curve/rail editing tools. Position and focal length interpolate linearly, while orientation follows the shortest quaternion arc. Character key points include position, heading, body pose, and hand pose. Matching bone rotations interpolate with quaternions. Bones without matching data hold their earlier pose until the next point. This does not generate walking cycles.

The first point supplies the board's normal still image and thumbnail. Playback is local UI state and does not create undo entries or dirty the document. Key points and edits remain undoable. **Return to editing** loads the evaluated frame at the selected time for editing. To convert a board back to static, select **Static** and save it.

## Animated GIF export

Save each dynamic board from Shot Generator before exporting. In the main storyboard window, use **File → Export Animated GIF**. Dynamic boards contribute every sampled frame from their saved animation clip; static boards remain still for their duration. Board order and timeline duration edits are preserved.

GIF frames include the reference/drawing layers above Shot Generator, dialogue, and the configured watermark. Output uses the project frame rate up to 30 fps. Frame delays are distributed in GIF's 10 ms units so rounding does not shorten the shot. GIF has no audio. A missing animation clip produces an error asking you to save the dynamic board again instead of silently exporting its poster frame.

## Top-plan export

Click **Export top plan** below Shot Generator's overhead view. Choose **PNG** or **PDF**, optionally include all movement paths, then choose the destination in the save dialog.

The export uses the current frame's positions and visibility and includes the overhead room outline, props, actor/camera icons and labels, shot title, and a meter scale bar. Paths use the existing blue/amber/purple color scheme. PNG output is 2400 × 2680 pixels; PDF output is a single A4 page. Playback pauses during capture. View swaps, the floating settings panel, and pose-picker UI are excluded. Export does not change key points or save the board.

Bounds include the room, rotated object footprints, and the entire movement path when enabled. This exports the current shot's existing overhead representation; it does not merge multiple boards into a shared master scene or reconstruct architectural geometry from imported environments.

## Separate Top Plans Timeline

Click the green **+ Add top plan to timeline** button below the PNG/PDF export button. It adds an overhead snapshot to the separate **Top Plans Timeline**, using the current scene setup. Click **Top Plans Timeline** beside **Boards / Timeline** at the bottom left of the main window. Plans never appear after camera boards.

A static top plan inherits the source board's duration. A dynamic top plan copies its key points and duration and renders an overhead playback clip. The new board has its own editable timeline; later edits to the original camera board do not automatically update this separate snapshot. The separate timeline contains only top plans, with duration controls, selection, playback, editing in Shot Generator, and deletion. While this tab is active, Animated GIF export uses its plans and overhead clips. Existing inline top plans are moved into this collection when a scene opens; their media and identifiers are preserved. Project copy and cleanup include plan media.

Reopen the inserted board in Shot Generator to edit it; it opens in the overhead view. The normal **Save dynamic board** / **Save to board** commands continue saving it as a top plan, even if you temporarily swap to the camera view for editing. The plan's framing includes all keyed object footprints and stays fixed as things move or become hidden. No floating editor controls are included in its images or video.

Top-plan boards store `renderView: 'top-plan'` inside `board.sg.data`; their camera and scene objects remain compatible with the existing snapshot model. Their board image uses the project's aspect ratio, rather than the title/scale sheet layout used by PNG/PDF export.

## Larger pose browser

Select a character, open the pose tab, and click the small **⤢** button beside the pose search. A large, scrollable gallery opens with bigger thumbnails and search by name or keyword. Click a thumbnail to apply the pose and close the gallery. **Close** or **Escape** dismisses it without selecting a pose. In a dynamic board, choosing a pose records it at the selected time. Body and hand poses remain independent between key points. Static boards retain their usual posing behavior.

The dynamic controls float over the viewport on a translucent background. Use the blue **Hide/Show** arrow button in the header to collapse or reopen the box; hiding it does not stop playback or change key points. Drag the **Dynamic settings** header to move the box. Drag its right edge, bottom edge, or visible bottom-right grip to resize it; the contents scroll while the header stays visible. Their text and buttons remain opaque for readability. Saved stills and clips come directly from the Three.js renderer and never contain this panel.

Older dynamic boards did not store per-key poses or visibility. Their existing global values are used as the initial fallback; assign the intended poses and visibility to their key points once to establish distinct values.

## Persistence and media

The optional `board.sg.data.motion` object contains:

```js
{
  schemaVersion: 1,
  durationMs: 2000,
  keyPoints: [
    { timeMs: 0, objects: {
      cameraId: { type: 'camera', x: 0, y: 6, z: 1,
        orientation: [0, 0, 0, 1], focalLengthMm: 35 },
      actorId: { type: 'character', x: 0, y: 0, z: 0,
        orientation: [0, 0, 0, 1] }
    } }
  ],
  baseObjects: {} // generated when saving; preserves authored transforms
}
```

Coordinates retain Storyboarder's Z-up storage convention. Quaternions use Three.js render coordinates and `[x,y,z,w]` ordering. Camera orientation follows the existing YXZ pan/tilt/roll convention. Lens calibration matches the existing camera inspector.

Each key object stores `visible` as a boolean. Hiding or showing an object or character records the change at the current time and holds it until the next key point. It never fades during interpolation.

Character key objects also contain a `pose` snapshot: model identifier, local bone rotations in `skeleton` and `handSkeleton`, and body/hand preset IDs. Runtime IK positions and world quaternions are excluded. During preview/render, IK cannot write evaluated poses back into authored state.

The standard `world`, `sceneObjects`, and `activeCamera` fields remain present as a static compatibility snapshot. Reopening restores authored transforms from `baseObjects`, independently of the first-point still image. Missing motion means static; unknown motion schemas are preserved and cannot be edited or saved by this version. Older Storyboarder versions may discard motion when saving a dynamic project.

Clips are H.264 MP4 files at `images/dynamic-<board UID>.mp4`, rendered with the project's frame rate using the existing bundled FFmpeg. UID-based filenames survive board reordering. Media enumeration includes the clip for copy/archive/cleanup; board duplication and clipboard copy/paste carry it with the board. Cancelling removes temporary render frames. A missing clip falls back to the still image; resave from Shot Generator to regenerate it.

Normal storyboard duration edits stretch clip playback to the new board duration. If audio extends playback, the final frame is held. The video surface follows the existing transport clock and disappears on stop or when a static board is reached.

This implementation covers Shot Generator authoring and main storyboard playback. GIF export includes dynamic animation; movie and editing exports still use their existing still-board pipelines. Hand-drawn storyboard layers are composited over dynamic frames in GIF export; the main storyboard video playback surface still uses the Shot Generator clip alone. Dedicated rail constraints, automatic walking cycles, and shared environments are separate features.

## Verification

```sh
./node_modules/.bin/mocha --require esm test/shot-generator/top-plan.test.main.js test/shot-generator/dynamic-board.test.main.js test/shot-generator/reducers.test.main.js test/models/board.main.test.js

env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron-mocha --renderer test/shot-generator/dynamic-board.renderer.test.js test/shot-generator/pose-picker.renderer.test.js test/exporters/dynamic-gif.renderer.test.js

NODE_OPTIONS=--openssl-legacy-provider npm run build:shot-generator

env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron test/shot-generator/dynamic-board.smoke.js
```

The smoke test uses a temporary profile, loads the full Shot Generator, saves a camera/character clip through the UI, checks that its frames differ, decodes it with the storyboard player, and exports both PNG and PDF top plans through the UI.

The narrow PeerJS Babel rule permits the installed dependency to build under Webpack 4. FFmpeg and Execa remain runtime Node dependencies so executable paths resolve correctly. Dependency versions are unchanged.

### Linked plans and cropping

Inserting a board from Shot Generator opens **Crop top plan** first. Adjust the four trim sliders, reset them, or cancel. Confirming creates the camera board and its related plan in their separate timelines. Dynamic plans use the same crop for every frame. Plans store `sourceBoardUid` to identify their camera board; they remain editable snapshots. The explicit **+ Add top plan to timeline** button also opens this crop window. Use **Play top plans** or the main play control while the Top Plans Timeline is active. Static plans hold for their duration; dynamic plans play their saved overhead clips.

### Export the Top Plans Timeline as PDF

Choose **Top Plans Timeline** at the bottom left, then **Export PDF**. Choose a destination in the save dialog. The PDF contains only saved top plans, in timeline order, one landscape A4 page per plan with duration and related board. Dynamic plans export their cropped starting layout, labeled as dynamic.
