# particle-look: the cross-language particle golden

Shared golden of [ADR 0081](../../docs/adr/0081-particle-studio-flows-and-tests.md) D6 (a) (brief B349): the runtime's `ParticleLook` (`engine-mod/src/main/java/dev/mcsupermods/runtime/client/particle/ParticleLook.java`), which dresses every project particle in game, and the app's preview simulation `particle-sim.ts` (Particle Studio, B353) must give the same frame, size, colour, alpha, roll and movement for the same definition. Nothing here is drawn; the look in game stays an in-game check (limit K4).

## The rules

Written from [ADR 0080](../../docs/adr/0080-custom-particle-types.md) D1 and D4, never from a vanilla particle class. `t` is `age / lifetime` clamped to 0..1 (the size adds the partial tick: `(age + partial) / lifetime`). Ages are those the game draws: 0 when made, then 1 up to the lifetime after each tick (the particle is removed on the tick after it reaches its lifetime).

- **Defaults** (`ParticleLook.Spec.resolve`): `animation` `age`, `frame_ticks` 2, `lifetime` 20, `size` 0.2, `size_end` = `size`, `gravity` 0, `friction` 0.98, `collision` true, `color` 16777215, `color_end` = `color`, `alpha` 1, `fade` `none`, `emissive` false, `translucent` true when `alpha` < 1 or `fade` is not `none` (else false), `spin` 0, `always_show` false.
- **Lifetime** of a range: `min + floor(r × (max − min + 1))` for `r` in [0, 1), clamped to `min..max`.
- **Frame**: one frame always 0. `age`: `floor(age × frames / lifetime)`, at most `frames − 1`. `loop`: `floor(age / frame_ticks) mod frames`. `random`: the frame picked when the particle is made (`random_frame` here).
- **Size**: `size + (size_end − size) × t`. This is vanilla's quad size: the square is drawn from `−size` to `+size` around the centre, so it is `2 × size` blocks wide (the preview must draw it that way).
- **Colour**: each channel of `0xRRGGBB` over 255, `from + (to − from) × t`.
- **Alpha**: `alpha` times the fade: `none` 1, `out` `1 − t`, `in_out` `min(1, t / 0.25, (1 − t) / 0.25)` (in over the first quarter of the life, out over the last).
- **Roll**: `spin × age` degrees, in radians (the game interpolates between the last two ticks' rolls).
- **Movement** (a particle that does not collide; `collision` does not change these numbers): each tick `yd −= 0.04 × gravity`, then `x += xd`, `y += yd`, `z += zd`, then `xd`, `yd`, `zd` are each multiplied by `friction`. `gravity` and `friction` are single-precision floats (in TypeScript, `Math.fround`) widened to double before multiplying; positions are doubles.

## The file

`golden.json`: `format` 1, `cases` (14) and `lifetimes` (5). Keys are sorted, numbers rounded to six decimals.

Each case: `name`; `definition` (an `msm:particle` definition as written in a project, absent fields take the defaults above); the inputs `frames` (how many textures the client found), `lifetime` (the lifetime used for the looks; for a range, one value inside it), `random_frame`, `start` and `velocity` (the spawn); `looks`, each with the inputs `age` and `partial` and the expected `frame`, `size`, `rgba` (`[r, g, b, a]`, each 0..1) and `roll` (radians); `positions`, each with the input `steps` and the expected `position` and `velocity` after that many ticks; and the expected `translucent` (the layer: true translucent, false cut-out).

Each `lifetimes` entry: the inputs `min`, `max`, `r` and the expected `lifetime`.

The cases: one picture with defaults; `age` frames; `loop` frames; a `random` frame; fade `out` with alpha 0.8; fade `in_out`; a colour curve; a size curve (with partial ticks); spin; gravity up with drag and a lifetime range (emissive); gravity down; no drag (`friction` 1); half drag (`friction` 0.5); `translucent` forced off with alpha 0.5.

## Tolerances

Every number is compared within 1e-5 (the file is rounded to six decimals; the looks are single-precision in the runtime). Integers (`frame`, `lifetime`) and booleans (`translucent`) match exactly.

## Who writes and checks it

- Runtime (the reference): `engine-mod/src/test/java/dev/mcsupermods/runtime/client/particle/ParticleLookGoldenTest.java` recomputes every expected value from the inputs and compares. `UPDATE_GOLDENS=1 ./gradlew --no-daemon test --tests '*ParticleLookGoldenTest'` in `engine-mod/` rewrites them. The runtime reads this folder through the system property `msm.particle.look` (set by `build.gradle.kts`), else `../fixtures/particle-look`.
- `ParticleLookTest` checks the rules by hand, independently of this file.
- App (B353): the `particle-sim.ts` test reads the same file and compares within the same tolerance; it never rewrites it.

## Changing it

Change the rules only in `ParticleLook` and `particle-sim.ts` together, and record the change in ADR 0080. Add a case by writing its inputs (with any expected values) and running the update command; then check the new values by hand before committing.
