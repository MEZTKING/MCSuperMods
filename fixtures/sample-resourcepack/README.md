# Sample resource pack project

A small MCSuperMods project used for manual in-game checks and as the exporter golden (`packages/exporters/test/sample-project.test.ts`, which pins the exported zip's SHA-256).

## Contents

| Element | Kind | Exports to |
|---|---|---|
| `msm_sample:block/ruby_block` | model (`cube_all` parent) | `assets/msm_sample/models/block/ruby_block.json` |
| `msm_sample:item/ruby` | model (`item/generated` parent) | `assets/msm_sample/models/item/ruby.json` |
| `msm_sample:ruby_block` | block definition | `assets/msm_sample/blockstates/ruby_block.json` |
| `msm_sample:ruby` | item definition | `assets/msm_sample/items/ruby.json` |
| `msm_sample:en_us` | lang | `assets/msm_sample/lang/en_us.json` |
| `msm_sample:pack` | pack metadata | `pack.mcmeta` |
| `minecraft:stick` | item definition | `assets/minecraft/items/stick.json` |

`minecraft:stick` overrides the vanilla stick's item definition so that a held stick shows the sample ruby: enable the pack in game and hold a stick to see that it is active. It is our own content written for a vanilla id, not a Mojang file.

## Textures

`assets/msm_sample/textures/block/ruby_block.png` and `assets/msm_sample/textures/item/ruby.png` are 16x16 images drawn from pixel maths by `tools/make-textures.mjs`, which also encodes the PNGs itself (stored deflate blocks, so the bytes are the same everywhere). They are original work, dedicated to the public domain (CC0). Regenerate them with:

```sh
node fixtures/sample-resourcepack/tools/make-textures.mjs
```

Changing a texture or an element changes the exported zip, so rerun the exporter golden with `UPDATE_GOLDENS=1` and commit the new hash on purpose.

The project contains no Mojang assets.
