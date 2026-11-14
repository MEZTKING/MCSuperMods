# geo-parity: the cross-language geo golden

Shared golden of [ADR 0072](../../docs/adr/0072-vanilla-model-renderer.md) D7 (brief B285): the app's preview baker and the runtime's vanilla model baker read the same Bedrock files and must put every vertex in the same place with the same UV. Nothing here is drawn; drawing, animation feel and textures stay in-game checks.

## Files

- `biped.geo.json`: the sample mob's model (`fixtures/sample-mob`, `glow_golem`, the element's `data` as it is): six box-UV bones, a parent chain, fractional origins.
- `features.geo.json`: one of each feature: box UV with `mirror` and `inflate` on the cube, box UV inherited from the bone (`mirror`, `inflate`), a box UV offset that is not a whole number, a box-UV cube with its own `pivot` and `rotation`, bone rest rotations on all three axes, per-face UV with `uv_size`, the default UV size, a fractional cube size, `uv_rotation` 90, 180 and 270, a face left out, a per-face cube with its own rotation, and a grandchild bone.
- `features.animation.json`: `pose_check` (linear keyframes, a constant vector channel; used for the posed golden), `features` (`pre`/`post`, `catmullrom`, Molang, plain-number strings, one number for three axes, `hold_on_last_frame`) and `once` (no `animation_length`, `loop` absent).
- `expected-vertices.json`: the golden. Written by the app, checked by both sides.

## The golden

`models` holds three entries: `biped` and `features` at rest, and `features posed` (the `pose_check` animation sampled at 0.25 s). Each lists its drawn faces in the preview baker's order: `bone`, `cube` (index in the bone), `face` (the file's face name), `box` (box UV) and four `vertices`, one per corner (top-left, top-right, bottom-left, bottom-right as Blockbench builds them), each `[x, y, z, u, v]`.

Positions are Blockbench scene space after the bone transforms (`boneMatrices` in `app/src/renderer/src/preview/geo/geometry.ts`): model pixels, 16 per block, y up, x mirrored against the Bedrock file (as Blockbench and GeckoLib draw it). UVs are divided by the texture size. Numbers are rounded to six decimals.

## Who writes and checks it

- App: `app/test/preview/geo-parity.test.ts` bakes the files with `geometry.ts` (and `keyframes.ts` for the pose) and compares with the golden (1e-5); `UPDATE_GOLDENS=1 pnpm --filter @msm/app exec vitest run test/preview/geo-parity.test.ts` rewrites it.
- Runtime: `engine-mod/src/test/java/dev/mcsupermods/runtime/model/GeoParityTest.java` reads the files with `GeoMeshReader` and `GeoAnimationReader`, bakes real vanilla `ModelPart`s with `client/vanilla/GeoModelBaker`, poses them as vanilla keyframe animations do (`offsetRotation`, `offsetPos`, `offsetScale`), walks them with `ModelPart.visit` under the living entity transform (`scale(-1, -1, 1)`, `translate(0, -1.501, 0)`, read from `LivingEntityRenderer.submit` on 26.3 and 26.4-snapshot-7), and matches each golden face to one baked polygon within 1e-4. The runtime reads this folder as `../fixtures/geo-parity` from `engine-mod/` (or the system property `msm.geo.parity`).

## Known differences the runtime test undoes

- Vanilla lifts living entities by 0.001 block (`1.501` rather than `1.5`): 0.016 model pixels taken off y.
- The preview insets box-UV faces by 1/64 pixel against texture bleeding; vanilla's `ModelPart.Cube` and GeckoLib 5.5.7 do not. The runtime test moves those UVs back out.
- The preview floors box-UV sizes (Blockbench's `updateUV`); vanilla and GeckoLib use the sizes as written. The fixtures keep box-UV sizes whole so this does not show; a box-UV cube with a fractional size is drawn in game as GeckoLib draws it, which differs from the preview.

## Changing it

Change the models only together with both bakers. After a change to `geometry.ts` or the fixtures, rewrite the golden with `UPDATE_GOLDENS=1`, then run `./gradlew test --tests 'dev.mcsupermods.runtime.model.*'` in `engine-mod/`; a failure names the face and the nearest baked polygon.
