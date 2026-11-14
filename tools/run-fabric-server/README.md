# run-fabric-server

Headless check of a Fabric content jar (ADR 0026 D6): starts a real Fabric dedicated server with the jar in `mods/` and passes when `msm_runtime` reports its registrations without errors.

```sh
node tools/run-fabric-server/index.ts --jar <content jar> --facts <fabric-facts.json> [options]
```

`--help` lists every option. With `--gametest <jar>` it runs a GameTest mod's tests on a production GameTest server instead (see "GameTests" below); `--no-runtime` checks a jar without `msm_runtime`, such as an ejected Java project's. The facts file is the one `packages/exporters/test/sample-mod.golden.test.ts` (or `sample-mob.golden.test.ts`, `sample-script.golden.test.ts`) writes next to the sample jar when `MSM_RUNTIME_JAR` and `MSM_SAMPLE_MOD_OUT` (or `MSM_RUNTIME_JAR`, `MSM_GECKOLIB_JAR` and `MSM_SAMPLE_MOB_OUT`; or `MSM_RUNTIME_JAR` and `MSM_SAMPLE_SCRIPT_OUT`) are set (see the samples' READMEs under `fixtures/`): `minecraft`, `loader` and `fabricApi` come from the target's Fabric facts (`Target.fabric`), so no version is written in the script or the workflow; `expectBlocks`, `expectItems` and `expectEntities` are the counts the runtime must report; `expectScripts` is the number of script files the runtime must report loading; `geckolib` (`fileName`, `url`, `sha512`) comes from the target's GeckoLib facts (`Target.geckolib`). `--minecraft`, `--loader`, `--fabric-api`, `--expect-blocks`, `--expect-items`, `--expect-entities` and `--expect-scripts` override the file.

## Two runs on one world

`--runs <n>` starts the server n times in the same run folder: the folder is prepared once (so the world is new for the first run) and each later run loads the world the previous one saved. Every run must pass the checks below on its own; a failure names its run (`run 2: ...`). The first run's output is kept in `<work>/run-fabric-server.log`, later ones in `run-fabric-server-run<k>.log`. `--expect-line <text>` (repeatable) requires, in every run, a log line that ends with the text, where `{run}` stands for the run's number. Not with `--gametest` (a GameTest server makes its own world).

```sh
node tools/run-fabric-server/index.ts --jar msm_sample_script.jar --facts fabric-facts.json --runs 2 --expect-line 'msm_sample_script:start_counter: start counter: {run}'
```

This is how CI checks saved script data across a restart (ADR 0062): the sample script's `start_counter` adds one to `starts` in `msm.storage` at each `server.started` and logs the count, so the second start must log `start counter: 2`.

## Sample data pack on a vanilla server

`vanilla-datapack.ts` checks the sample data pack's villager trade (`fixtures/sample-datapack/README.md`, "Headless server check") on a vanilla dedicated server, with no Fabric and no runtime:

```sh
MSM_SAMPLE_DATAPACK_OUT=<folder> pnpm --filter @msm/exporters exec vitest run test/sample-datapack.golden.test.ts
node tools/run-fabric-server/vanilla-datapack.ts --facts <folder>/server-facts.json [--work <dir>] [--cache <dir>]
```

It reads `minecraft` and `zip` from the facts file, downloads the server jar named by Mojang's version manifest (`piston-meta.mojang.com`; the version's JSON and the jar each checked against their SHA-1) into the cache as `minecraft-server-<version>.jar`, puts the zip into a fresh `world/datapacks/`, starts the server and runs the README's console commands, each waiting for its own `System chat:` answer (a `Can't keep up!` or save line is never taken for one): hard difficulty, the clock stopped at midnight (`gamerule advance_time false`, `time set midnight`; a zombie villager in daylight burns within about 30 s), a `NoAI` zombie and 40 `NoAI` level 1 fletchers (`--villagers`). A mob summoned into the just force-loaded chunk exists before `@e` can see it, so the script polls `execute if entity` (at most 60 s each) until it counts every fletcher, the zombie and the wolf and goat horn below (by their tags), and only then has the zombie kill them with `damage ... by`, which on hard turns each into a zombie villager on the spot that keeps the offers it drew from `minecraft:fletcher/level_1`; it polls again until all 40 are zombie villagers. Before this pacing (2026-11-14) a loaded CI run could take an unrelated line for a command's answer and so send the kill and even the checks while the mobs were still out of `@e`'s sight (one 26.4 run counted no wolf and no horn at game time 2), or reach the checks after the zombie villagers had burned, and count none. It also summons a `NoAI` wolf whose `variant` is the sample's `msm_sample_data:frost` and a goat horn item whose `minecraft:instrument` is the sample's `msm_sample_data:frost_call` (B255): an entity or item naming an id missing from its registry does not keep it (the wolf falls back to a vanilla variant, the horn fails to decode), so finding them again by those ids with `execute if entity ... nbt=...` proves both registry entries loaded. It passes when the zip is listed by `datapack list enabled`, every fletcher, the zombie, the wolf and the horn were found before the kill, the counts of zombie villagers, of those offering the new trade (4 spectral arrows), of those still offering the vanilla arrow trade, of wolves of the variant and of horns of the call are all above zero, and the log has no `Failed to load`, `Couldn't load tag`, `Couldn't parse`, `Registry loading errors` or ERROR line (the sample's brewing recipe names vanilla potions only; one naming an unregistered potion would fail the whole data pack, ADR 0063). The console output is kept in `<work>/vanilla-datapack.log`. A warm run takes about 15 s.

## Library data packs on a vanilla server

`vanilla-packs.ts` loads the data pack of every library starter (default answers, each wizard alternative and the minimums), example and `examples/` mirror project into a vanilla dedicated server. Projects with `msm:` kinds are included too: their data pack is exported as the app's vanilla data pack export does it, without potions (ADR 0063 D6) and through the vanilla pack safety rule (ADR 0066), so it must load without the Fabric mod jar. The `examples/` mirror projects with `msm:` kinds are written for the default target and are left out on the other target (the library's own examples still cover it):

```sh
MSM_TARGET_ID=mc-<mc> MSM_LIBRARY_PACKS_OUT=<folder> pnpm --filter @msm/exporters exec vitest run test/library.test.ts -t "vanilla server data packs"
node tools/run-fabric-server/vanilla-packs.ts --packs <folder>/packs.json [--work <dir>] [--cache <dir>] [--max-runs <n>]
```

The test exports each pack as the app's vanilla data pack export does, each under its own namespace, and writes `<name>.zip` files and `packs.json` (`minecraft`, `packs`: `zip`, `source`, `mod`, `leftOut`, `skippedFunctions`). The rule's warnings (`export.mod-only-reference`, `export.mod-only-function`) are the only problems allowed; a function it kept with a warning is listed in `skippedFunctions`, and its `Failed to load function` line does not fail the run (any function tag entry naming it is optional, so no tag is dropped). The script downloads the server jar as `vanilla-datapack.ts` does, puts the packs into as few worlds as it can (two packs share a world unless both write the same file outside `tags/`; tags merge), starts the server on each world and runs `datapack list enabled`. A world passes when the log has `Done (`, every pack is listed as enabled and there is no `Failed to load datapacks`, `Errors in registry`, `Registry loading errors`, `Couldn't load tag`, `Failed to load function`, `Couldn't parse` or ERROR line. On 26.3 and later a single registry-loaded file (recipe, loot table, advancement, predicate, item modifier, villager trade, enchantment, jukebox song and the like) naming an unknown id stops the server starting; a tag with a missing plain entry and a function that does not parse are dropped with an error line.

When a world fails, the script names the culprit: the packs the log names (`file/<pack>`, or the pack holding a function that failed to load), otherwise by halving the packs, then by halving each culprit pack's files. A subset counts as failing only when it logs one of the full run's specific problem lines again, so leaving out a file another file needs does not mislead the search. Bisecting stops after `--max-runs` server runs (default 60). Each run's console output is kept as `<work>/<label>.log` (`world-1.log`, `<pack>-files-<n>.log`). A warm run of one world takes about 20 s.

What this cannot see: a field the game ignores. Unknown keys load without a word (in 26.3 loot entries take `modifier` and `condition`; an old `functions` or `conditions` there is ignored, while `minecraft:sequence` still takes `functions`, checked on the 26.3 and 26.4 servers), so those need the content's own tests or an in-game check.

## GeckoLib

A content jar with entities nests GeckoLib (ADR 0029 D4), so by default the tool relies on the nested copy and downloads nothing for it; the facts' `geckolib` entry is then unused. For a jar exported with "Separate runtime and GeckoLib (for modpacks)", pass `--separate-geckolib`: the tool downloads the jar from the facts' `url` into the cache as `<fileName>`, checks its SHA-512 and puts it in `mods/` (add the separate runtime with `--extra`). This keeps one GeckoLib in the normal case and needs no GeckoLib flag in CI. CI gets the real GeckoLib jar for the sample-mob export from `sample-mob.golden.test.ts` itself, which downloads it into this tool's cache (`MSM_GECKOLIB_JAR`) when it is missing.

## GameTests

`--gametest <jar>` (ADR 0033 D5) runs the GameTests of a GameTest mod, such as `engine-mod/parity/build/libs/msm_parity_tests-<version>.jar` (`cd engine-mod && ./gradlew -p parity build`), against the jar under test:

```sh
node tools/run-fabric-server/index.ts --jar <content jar> --facts <fabric-facts.json> --gametest <parity jar> --gametest-filter 'msm_parity_tests:sample_mod_*'
node tools/run-fabric-server/index.ts --jar <ejected jar> --facts <fabric-facts.json> --no-runtime --gametest <parity jar> --gametest-filter 'msm_parity_tests:sample_mod_*'
```

- The test jar goes into `mods/` together with Fabric API's `fabric-gametest-api-v1` module: the `fabric-api` jar lists that module in its POM but does not nest it, so a production server lacks it. The tool reads the module's version from `fabric-api-<version>.pom` and downloads the jar from maven.fabricmc.net, checked against its `.sha1`.
- The JVM gets `-Dfabric-api.gametest=true` and `-Dfabric-api.gametest.report-file=<report>` (`--report <file>`, default `<work>/gametest-report.xml`). Fabric API then starts Minecraft's GameTest server in place of the dedicated server, in a fresh `world/`: it runs every registered test (Minecraft's own `minecraft:always_pass` included), writes the report, stops by itself and exits with the number of failed required tests (`GameTestServer.onServerExit`; -1, shown as 255, when no tests could be selected or the vanilla data pack failed to load; 1 on a crash). It never logs `Done (` and needs no `stop`.
- The report is JUnit-like XML: `<testsuite><testsuite time=".." timestamp="..">` with one `<testcase classname="<structure>" name="<namespace>:<test>" time=".."/>` per test and a `<failure message=".."/>` child for a failed one. Test names are the mod id plus the class and method in snake case, such as `msm_parity_tests:sample_mod_parity_test_ruby_ore_is_registered`.
- `--gametest-filter <selector>` runs only the tests matching a test selector (`-Dfabric-api.gametest.filter`, Minecraft's resource selector with `*` and `?` wildcards, such as `msm_parity_tests:sample_mod_*`). The parity jar holds the tests of both samples, and each sample's tests fail without that sample, so every parity run names its sample's tests. A selector matching nothing makes the server exit with -1 (255).
- The run passes when the exit status is 0, the report exists, lists at least one test outside the `minecraft` namespace and has no `<failure>`, and the log rules below hold except `Done (`. The tool prints each test as `pass`, `skip` or `FAIL` with its message.

`--no-runtime` is for jars without `msm_runtime` (ejected projects): the registration and entity lines are not required, and any `[msm_runtime]` line fails the run. Without `--gametest` the run still needs `Done (`.

A GameTest run takes about as long as a plain start (20 to 40 s warm). Each `--work` folder downloads the game server once; reuse one folder for several runs, with a `--report` per run (the tool creates the report's folder).

## What it does

1. Downloads into the cache (`--cache`, default `~/.cache/msm-fabric-server`):
   - the Fabric server launcher from `https://meta.fabricmc.net/v2/versions/loader/<game>/<loader>/<installer>/server/jar`, with the latest stable installer from `/v2/versions/installer` (or `--installer`);
   - Fabric API from `https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/<version>/fabric-api-<version>.jar`, checked against the published `.sha1`;
   - with `--separate-geckolib` only, GeckoLib from the facts' `url`, checked against the facts' `sha512`.
2. Prepares the run folder (`--work`, default `<tmp>/msm-fabric-server`): `eula.txt`, an offline `server.properties` on a free port, a fresh `mods/` with Fabric API, the content jar, any `--extra` jars (for example a separate `msm_runtime`) and the downloaded GeckoLib with `--separate-geckolib`, and no world, logs or config from an earlier run. The launcher downloads the game server and its libraries into the run folder on the first start and reuses them later.
3. Runs `java -Xmx2G -jar fabric-server-launch.jar nogui` (with the GameTest properties under `--gametest`) (Java from `--java`, else `$JAVA_HOME/bin/java`, else `java`; the game needs Java 25), sends `stop` once the server logs `Done (` (not in a GameTest run, which stops by itself) and waits for it to exit. `--timeout` (default 900 s) kills a hung server. The whole output is echoed and kept in `<work>/run-fabric-server.log`.
4. Passes (exit 0) when:
   - the server logged `Done (` and exited with status 0;
   - `[msm_runtime] registered N block(s) and M item(s) from F definition file(s); E error(s), W warning(s)` appears once, with E = 0, W = 0 (unless `--allow-warnings`) and N, M as expected;
   - with `expectEntities` given, `[msm_runtime] registered K entity type(s)` appears once with K as expected (without it the line is optional);
   - with `expectScripts` given, `[msm_runtime] loaded S script(s); E error(s)` appears once with S as expected and E = 0 (without it the line is optional). In a GameTest run the line may appear again (a test that runs `/reload` loads the scripts again), with the same S and E = 0. S counts every script file the runtime found, `require`d modules included (B133); E counts the load-time errors (a script that fails to load, an unknown event name), each also logged at ERROR, which fails the run anyway;
   - no other `[msm_runtime]` line is at WARN or ERROR (this includes the checks the runtime makes after the server starts, such as unknown functions);
   - no line naming GeckoLib (case-insensitive `geckolib`) at ERROR, nor at WARN unless `--allow-warnings`; GeckoLib's info lines pass. The dedicated server's console shows no logger names, so GeckoLib's lines are recognised by naming it;
   - no `Failed to load`, no mod resolution failure, no `Game test server crashed` and no stack frame from `dev.mcsupermods` or `com.geckolib` (server frames read `at knot//<class>`; frames of the parity tests, `dev.mcsupermods.parity`, are test failures and are left to the report).

It prints the key lines (the mod list with nested jars, the registration and script lines, the scripts' own `msm.log` lines, `Done`) and then `PASS` or each `FAIL` reason.

## Where it runs

CI's `engine-mod` job (`.github/workflows/ci.yml`) runs it on `fixtures/sample-mod`, on `fixtures/sample-mob` (GeckoLib nested) and on `fixtures/sample-script` (scripts, two runs on one world) after `./gradlew build`, runs `vanilla-datapack.ts` on `fixtures/sample-datapack` and `vanilla-packs.ts` on the library's vanilla data packs, then runs the parity GameTests five times in one run folder: the sample mod's tests on its content jar and on its ejected jar (`--no-runtime`), the sample mob's tests likewise, and the sample script's on its content jar. The reports are kept as the artefact `parity-gametest-reports-mc<version>`. Locally it needs JDK 25 and network access to meta.fabricmc.net, maven.fabricmc.net and Mojang's download servers (piston-meta.mojang.com and piston-data.mojang.com for `vanilla-datapack.ts`); a warm run takes about 30 s.

Downloads are untrusted data: they are only stored and run as the Fabric server they claim to be, inside the run folder.
