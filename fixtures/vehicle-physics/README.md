# vehicle-physics: the cross-language vehicle physics golden

[ADR 0090](../../docs/adr/0090-vehicles.md) D3: `golden.json` will hold steps of the runtime's pure `VehiclePhysics` (input, state and constants in, velocity and yaw out) across the five movement modes (`ground`, `water`, `amphibious`, `air`, `hover`), written by the runtime's JUnit test and read by the Try it simulation's TypeScript twin (`@msm/sim`, [ADR 0091](../../docs/adr/0091-vehicle-flows-studios-try-it-and-tests.md) D6), so the two cannot drift apart unseen.

Empty until B412 adds `golden.json` and its writer (at least 30 steps across the five modes); B428 reads it.
