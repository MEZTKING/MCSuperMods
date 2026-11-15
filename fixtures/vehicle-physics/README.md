# vehicle-physics: the cross-language vehicle physics golden

Shared golden of [ADR 0090](../../docs/adr/0090-vehicles.md) D3 (brief B412): the runtime's pure `VehiclePhysics` (`engine-mod/src/main/java/dev/mcsupermods/runtime/registry/vehicle/VehiclePhysics.java`), which moves every project vehicle in game, and the Try it simulation's TypeScript twin (`@msm/sim`, [ADR 0091](../../docs/adr/0091-vehicle-flows-studios-try-it-and-tests.md) D6, brief B428) must give the same velocity, facing, throttle, speed and steering for the same movement block, state, input and surroundings. Nothing here touches blocks: the game (or the simulation) applies the velocity with its own collision afterwards.

## The rules

Written from ADR 0090 D3, never from a vanilla boat, minecart or horse class; every constant is MSM's own and named in `VehiclePhysics`. Angles are degrees as the game's: yaw 0 faces south (+z) and grows turning right, so the facing is `(-sin yaw, 0, cos yaw)` and the right is `(-cos yaw, 0, -sin yaw)`; pitch is positive looking down, and the nose of a plane points along `(-sin yaw cos pitch, -sin pitch, cos yaw cos pitch)`. Speeds are blocks per tick. Angles are never normalised (compare yaw modulo 360).

- **Defaults** (`VehiclePhysics.Constants.resolve`, by mode): `max_speed`, `acceleration`, `braking`, `turn_rate`, `step_height` are ground 0.4, 0.02, 0.04, 5, 1; water 0.35, 0.015, 0.03, 4, 0; amphibious as ground; air 1.2, 0.03, 0.03, 3, 0.5; hover 0.5, 0.04, 0.06, 8, 0. Every mode: `reverse_factor` 0.4, `grip` 0.8, `lift_speed` 0.15, `takeoff_speed` half of `max_speed`, `turns_in_place` and `floats` false.
- **Which rules apply.** `wet` is `water_depth > 0`; `submerged` is `wet` and (not `on_ground` or `water_depth > 0.5`). ground: submerged uses the land vehicle in water rule, else land. water: wet uses water, else land at a tenth (`OUT_OF_ELEMENT` 0.1 of top speed and acceleration). amphibious: submerged uses water, else land. air: submerged uses the land vehicle in water rule, else air. hover: always hover.
- **Land.** Off the ground: velocity times 0.98 (`AIR_DRAG`), vy = (vy − 0.04) × 0.98, yaw kept, throttle and steering 0. On the ground: drive (below) with `grip`, coast 0.95, minimum turn 0; vy = (vy − 0.04) × 0.98 (the game's collision then stops it).
- **Drive.** `along` is the velocity along the old facing, the rest is the lateral part. Forwards while rolling back brakes by `braking` up to 0; back while rolling forwards brakes down to 0; forwards with the engine adds the acceleration up to the top speed (throttle 1); back with the engine takes it away down to minus top speed times `reverse_factor` (throttle −1); otherwise the speed is multiplied by the coast. Above the range it loses at most `braking` a tick; below 0.001 it is 0. Turning: steer is right − left; `moving` = min(1, |speed| / (top speed × 0.5)); with `turns_in_place` the factor is 1 with the engine and `moving` without; otherwise max(minimum turn if the engine runs, `moving`), negated in reverse. yaw += steer × `turn_rate` × factor. The new horizontal velocity is (old facing × speed + lateral), moved `grip` of the way to the new facing × speed. Reported speed is along the new facing.
- **Water.** Drive with grip 0.35, coast 0.97, minimum turn 0.3; vy = (vy + clamp((depth − 0.12) × 0.1, −0.04, 0.1)) × 0.75: the hull rests 0.12 below the waterline.
- **Land vehicle in water.** With `floats`, water at a tenth; else velocity × 0.8 and vy = (vy − 0.02) × 0.8, no control.
- **Air.** `airspeed` = max(0, velocity · old nose); `sink` = vy − old nose y × airspeed. Forwards raises the lever by 0.05 (to 1), back lowers it (to 0). Target = lever × top speed with the engine, else 0; the airspeed gains `acceleration` towards it or loses `braking`. On the ground the yaw turns towards the view at `turn_rate` × `moving`, the pitch towards clamp(view pitch, −40, 0) only from `takeoff_speed` on (else towards 0), and the velocity is nose × airspeed with 0.04 taken off vy. In the air the yaw and pitch (clamped ±40) turn towards the view at `turn_rate`; `lift` = min(1, airspeed / `takeoff_speed`) (1 when that is 0); sink becomes sink × 0.8 at full lift, else (sink − 0.04 × (1 − lift)) × 0.98; the velocity is nose × airspeed plus the sink on vy. Steering is the yaw change over `turn_rate`, clamped to ±1.
- **Hover.** With the engine the yaw turns towards the view at `turn_rate`; the wanted horizontal velocity is facing × (forwards: top speed; back: −top speed × `reverse_factor`) + right × strafe × top speed, scaled down to the top speed; the velocity moves towards it by at most `acceleration` (as a vector), vy towards `lift_speed` (jump), −`lift_speed` (descend) or 0 by at most `acceleration`; throttle 1, steering the strafe. Without the engine the horizontal velocity is × 0.9 and vy moves towards −0.05 by 0.01 a tick. Deeper in water than 0.12, vy is at least the water rule's.

## The file

`golden.json`: `format` 1 and `cases` (10, 64 steps). Keys are sorted, numbers rounded to six decimals.

Each case: `name`; `movement` (a `movement` block as written in a vehicle definition; absent fields take the defaults above); the expected `resolved` (every constant after defaults); `start` (`vx`, `vy`, `vz`, `yaw`, `pitch`, `throttle`; `speed` and `steering` are outputs and ignored); and `steps`, each with the inputs `input` (`forward`, `back`, `left`, `right`, `up`, `down`, `view_yaw`, `view_pitch`) and `env` (`on_ground`, `water_depth`, `engine`) and the expected `state` after that step. Each step starts from the previous step's state (the first from `start`).

The cases: ground accelerating, steering, coasting, braking and reversing; a tank turning in place with and without its engine; low grip; ground falling, sinking and wading; a floating ground vehicle; a boat bobbing up, turning on the spot, drifting and crawling on land; amphibious on land and water; a plane rolling, lifting off, following the view and stalling; a plane below takeoff speed; a hovering vehicle moving, climbing, descending, holding, losing power and floating.

## Tolerances

Every number is compared within 1e-5 (the file is rounded to six decimals); booleans and strings match exactly. Each side computes its own chain of states from the inputs, so rounding does not add up across steps.

## Who writes and checks it

- Runtime (the reference): `engine-mod/src/test/java/dev/mcsupermods/runtime/registry/vehicle/VehiclePhysicsGoldenTest.java` recomputes `resolved` and every `state` from the inputs and compares; it also requires at least 30 steps and every mode. `UPDATE_GOLDENS=1 ./gradlew --no-daemon test --tests '*VehiclePhysicsGoldenTest'` in `engine-mod/` rewrites them. The runtime reads this folder through the system property `msm.vehicle.physics` (set by `build.gradle.kts`), else `../fixtures/vehicle-physics`.
- `VehiclePhysicsTest` checks the rules by hand, independently of this file.
- Try it (B428): the simulation's twin reads the same file and compares within the same tolerance; it never rewrites it.

## Changing it

Change the rules only in `VehiclePhysics` and the twin together, and record the change in ADR 0090. Add a case by writing its inputs (with any expected values) and running the update command; then check the new values by hand before committing.
