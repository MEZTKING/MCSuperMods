# run-fabric-server

Headless check of a Fabric content jar (ADR 0026 D6): starts a real Fabric dedicated server with the jar in `mods/` and passes when `msm_runtime` reports its registrations without errors.

```sh
node tools/run-fabric-server/index.ts --jar <content jar> --facts <fabric-facts.json> [options]
```

`--help` lists every option. With `--gametest <jar>` it runs a GameTest mod's tests on a production GameTest server instead (see "GameTests" below); `--no-runtime` checks a jar without `msm_runtime`, such as an ejected Java project's. The facts file is the one `packages/exporters/test/sample-mod.golden.test.ts` (or `sample-mob.golden.test.ts`, `sample-script.golden.test.ts`) writes next to the sample jar when `MSM_RUNTIME_JAR` and `MSM_SAMPLE_MOD_OUT` (or `MSM_RUNTIME_JAR`, `MSM_GECKOLIB_JAR` and `MSM_SAMPLE_MOB_OUT`; or `MSM_RUNTIME_JAR` and `MSM_SAMPLE_SCRIPT_OUT`) are set (see the samples' READMEs under `fixtures/`): `minecraft`, `loader` and `fabricApi` come from the target's Fabric facts (`Target.fabric`), so no version is written in the script or the workflow; `expectBlocks`, `expectItems` and `expectEntities` are the counts the runtime must report; `expectScripts` is the number of script files the runtime must report loading; `geckolib` (`fileName`, `url`, `sha512`) comes from the target's GeckoLib facts (`Target.geckolib`). `--minecraft`, `--loader`, `--fabric-api`, `--expect-blocks`, `--expect-items`, `--expect-entities` and `--expect-scripts` override the file.

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
   - with `expectScripts` given, `[msm_runtime] loaded S script(s); E error(s)` appears once with S as expected and E = 0 (without it the line is optional). S counts every script file the runtime found, `require`d modules included (B133); E counts the load-time errors (a script that fails to load, an unknown event name), each also logged at ERROR, which fails the run anyway;
   - no other `[msm_runtime]` line is at WARN or ERROR (this includes the checks the runtime makes after the server starts, such as unknown functions);
   - no line naming GeckoLib (case-insensitive `geckolib`) at ERROR, nor at WARN unless `--allow-warnings`; GeckoLib's info lines pass. The dedicated server's console shows no logger names, so GeckoLib's lines are recognised by naming it;
   - no `Failed to load`, no mod resolution failure, no `Game test server crashed` and no stack frame from `dev.mcsupermods` or `com.geckolib` (server frames read `at knot//<class>`; frames of the parity tests, `dev.mcsupermods.parity`, are test failures and are left to the report).

It prints the key lines (the mod list with nested jars, the registration and script lines, the scripts' own `msm.log` lines, `Done`) and then `PASS` or each `FAIL` reason.

## Where it runs

CI's `engine-mod` job (`.github/workflows/ci.yml`) runs it on `fixtures/sample-mod`, on `fixtures/sample-mob` (GeckoLib nested) and on `fixtures/sample-script` (scripts) after `./gradlew build`, then runs the parity GameTests four times in one run folder: the sample mod's tests on its content jar and on its ejected jar (`--no-runtime`), and the sample mob's tests likewise. The reports are kept as the artefact `parity-gametest-reports`. Locally it needs JDK 25 and network access to meta.fabricmc.net, maven.fabricmc.net and Mojang's download servers; a warm run takes about 30 s.

Downloads are untrusted data: they are only stored and run as the Fabric server they claim to be, inside the run folder.
