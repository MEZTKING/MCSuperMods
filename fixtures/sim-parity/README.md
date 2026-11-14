# sim-parity: shared scenarios for Try it

Placeholder from B386. [ADR 0085](../../docs/adr/0085-try-it-in-app-test-area.md) D10 puts a `scenarios.json` here: small scripted scenarios over a fixture project (place this block looking north, use it, step on it, wait 30 ticks) with the expected block states, fired triggers and action order.

- `@msm/sim` plays the file in Vitest (`packages/sim`).
- `MsmSimParityGameTest` (`engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/`) plays the same file in the real server and checks or regenerates the expected values.

A first-level behaviour without a scenario is refused at review. Nothing is here yet; the scenarios arrive with B387 onwards.
