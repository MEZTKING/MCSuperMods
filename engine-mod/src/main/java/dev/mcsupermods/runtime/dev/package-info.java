/**
 * Runtime dev mode, server side (ADR 0084 D4, D6; B369). {@link dev.mcsupermods.runtime.dev.DevMode} decides once per
 * server, at {@code SERVER_STARTING}, whether dev mode is on: only for a client's integrated server when
 * {@code <gameDir>/msm-dev/dev.json} is valid, or in a GameTest run when the property
 * {@value dev.mcsupermods.runtime.dev.DevMode#TEST_ROOT_PROPERTY} names a dev folder. A dedicated server outside a GameTest
 * run never looks at {@code msm-dev/}. {@link dev.mcsupermods.runtime.dev.DevFiles} reads the formats B366 writes (read only),
 * {@link dev.mcsupermods.runtime.dev.EventOverlay} swaps event action lists from {@code overlay/msm/<ns>/<kind>/} on
 * {@code END_DATA_PACK_RELOAD}, and {@link dev.mcsupermods.runtime.dev.DevSetup} runs {@code setup.mcfunction} on joining
 * the test world. The one file written into the dev folder is {@link dev.mcsupermods.runtime.dev.DevBiomeLists}'s
 * ({@code biome-lists.json}, vanilla's resolved biome lists for the app's live world generation preview, B592); the client
 * side (requests, status, world creation) is B374's.
 */
package dev.mcsupermods.runtime.dev;
