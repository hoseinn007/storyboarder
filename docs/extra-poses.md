# Extra Shot Generator poses

77 additional static pose presets are bundled from Quaternius's Universal Animation Library Standard. Search **quaternius** or **Q -** in the pose picker. 40 animation clips are sampled at 25% (A) and 65% (B), with duplicate poses removed. Examples include driving, talking, crouching, swimming, dancing, pushing, picking up, pistol aiming, and sword actions.

These are sampled poses, not imported animation clips. They work with the existing pose picker and dynamic-board pose key points. No dependency upgrades or character model replacements are required. Original built-in poses and user presets are retained.

Source and license:

- Creator: Quaternius (the pack also credits animator Gonzalo Furnier).
- Creator page: https://quaternius.itch.io/universal-animation-library (CC0).
- Download mirror: https://github.com/J-Ponzo/gltf-universal-animation-library
- Pinned commit: `e24c23cf2a1323488a3faa226ea7ea21f644b73e` (2025 Standard glTF release).
- Files: `glTF/AnimationLibrary_Godot_Standard.gltf` and `.bin`.
- Full CC0 notice: `src/data/shot-generator/poses/quaternius/LICENSE.txt`.
- Each generated preset records its source clip, sampled phase, author, and license.

To regenerate, download the two files from the pinned mirror and run:

```
node scripts/import-quaternius-poses.js /path/to/AnimationLibrary_Godot_Standard.gltf /path/to/AnimationLibrary_Godot_Standard.bin
```

The importer samples source quaternion tracks, transfers world-space bind-pose rotation deltas to Storyboarder's adult-male skeleton, and solves local rotations in parent-first order. It omits root translation, mesh/texture data, and finger tracks. Limb proportions differ across characters; props and contact points may require manual adjustment. The new presets are stored separately in `quaternius-poses.json` and merged with the original library by `poses.js`.
