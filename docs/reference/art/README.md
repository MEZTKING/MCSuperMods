# Drawn art: contact sheet and notes

The contact sheet of MSM's vanilla-style generator (ADR 0092 option B, `docs/PLAN-art.md`). Everything here is drawn by MSM's own code in `packages/plugins/library/src/art/`; no Minecraft texture was opened, traced, measured or compared to make it (ADR 0092 D12).

## The sheet

`sheet.png` shows every recipe of the table (`ART_RECIPE_INFO`) in table order: blocks, items, worn pictures, the effect icon and the particles. Each recipe is drawn at four Surprise me theme colours side by side (Ruby `#c41c34`, Frost `#8fd3ff`, Moss `#4c8a2c`, Amber `#de9420`), seed 0, normal detail, the first finish, at 4x on a grey ground; a particle shows its four frames for each colour. Recipes that are still stubs (`drawn: false`) show the placeholder pattern they fall back to, so the sheet also shows what is left to draw.

Only the main session regenerates it, after each wave has merged:

```
UPDATE_ART_SHEET=1 pnpm --filter @msm/plugin-library test
```

The goldens of the drawn recipes are in `packages/plugins/library/test/fixtures/art/` (`UPDATE_GOLDENS=1`; one folder per brief).

## Numbers chosen at B491

- **Hue shift: 12 degrees** (`ART_HUE_SHIFT` in `art/materials.ts`), chosen by eye from the twenty prototype recipes drawn at 16, 12 and 10 degrees in six theme colours. At 16 the shadows of yellows and ambers turn olive (bark most of all); at 10 the ramps look flat and the warm-light, cool-shadow lean almost disappears; 12 keeps the lean visible without changing what colour a thing reads as. The low-level `generateRamp` keeps its own default of 16, which the vanilla parity pictures (B459) are drawn with, so they do not change.
- **Detail:** `smooth` halves the shade noise, `rough` takes 1.5 times it (`DETAIL_NOISE`); on clustered faces it scales every share of the off-centre shades, on items it scales the clustered flecks and the number of seeded nudges.
- **Speed:** one 16 by 16 recipe draws in 0.21 to 0.34 ms (median of 100, a Linux container), six variations in 1.3 to 2.3 ms; the limits are 2 ms and 20 ms (ADR 0092 D17).

## The ramp maths and the engine (fact A2, ADR 0092 D11)

The colour maths uses `Math.cbrt`, `Math.pow` (written as `Math.pow`, not `**`, so a test can reach it), `Math.atan2`, `Math.hypot`, `Math.sin` and `Math.cos`; the noise uses only integer and plain floating-point arithmetic and a sort, which are exact in every engine. Findings:

- Node and Electron both run V8, which computes these functions with its own implementations (ported from fdlibm) on every platform rather than the system's maths library, so the same look gives the same bytes on Linux, Windows and macOS. A run of the golden test on Windows is still to be seen in CI (verify at implementation).
- Every shade is rounded to bytes before it is drawn, so a different last bit could only matter where a value sits within about 1e-13 of a rounding edge. `art.test.ts` checks this directly: it nudges each of the six functions by one unit in the last place, up and then down, and every drawn recipe in the twelve test colours and every finish keeps its bytes. No further rounding was needed.
- Another engine (a browser other than Chromium, for example) might still differ on some colour not in the test set; the mitigation would be to compare goldens by pixels within one step instead of by bytes.
