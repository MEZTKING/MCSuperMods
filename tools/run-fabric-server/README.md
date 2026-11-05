# run-fabric-server

Headless check of a Fabric content jar (ADR 0026 D6): starts a real Fabric dedicated server with the jar in `mods/` and passes when `msm_runtime` reports its registrations without errors.

```sh
node tools/run-fabric-server/index.ts --jar <content jar> --facts <fabric-facts.json> [options]
```

`--help` lists every option. The facts file is the one `packages/exporters/test/sample-mod.golden.test.ts` writes next to the sample jar when `MSM_RUNTIME_JAR` and `MSM_SAMPLE_MOD_OUT` are set (see `fixtures/sample-mod/README.md`): `minecraft`, `loader` and `fabricApi` come from the target's Fabric facts (`Target.fabric`), so no version is written in the script or the workflow; `expectBlocks` and `expectItems` are the counts the runtime must report. `--minecraft`, `--loader`, `--fabric-api`, `--expect-blocks` and `--expect-items` override the file.

## What it does

1. Downloads into the cache (`--cache`, default `~/.cache/msm-fabric-server`):
   - the Fabric server launcher from `https://meta.fabricmc.net/v2/versions/loader/<game>/<loader>/<installer>/server/jar`, with the latest stable installer from `/v2/versions/installer` (or `--installer`);
   - Fabric API from `https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/<version>/fabric-api-<version>.jar`, checked against the published `.sha1`.
2. Prepares the run folder (`--work`, default `<tmp>/msm-fabric-server`): `eula.txt`, an offline `server.properties` on a free port, a fresh `mods/` with Fabric API, the content jar and any `--extra` jars (for example a separate `msm_runtime`), and no world, logs or config from an earlier run. The launcher downloads the game server and its libraries into the run folder on the first start and reuses them later.
3. Runs `java -Xmx2G -jar fabric-server-launch.jar nogui` (Java from `--java`, else `$JAVA_HOME/bin/java`, else `java`; the game needs Java 25), sends `stop` once the server logs `Done (` and waits for it to exit. `--timeout` (default 900 s) kills a hung server. The whole output is echoed and kept in `<work>/run-fabric-server.log`.
4. Passes (exit 0) when:
   - the server logged `Done (` and exited with status 0;
   - `[msm_runtime] registered N block(s) and M item(s) from F definition file(s); E error(s), W warning(s)` appears once, with E = 0, W = 0 (unless `--allow-warnings`) and N, M as expected;
   - no other `[msm_runtime]` line is at WARN or ERROR (this includes the checks the runtime makes after the server starts, such as unknown functions);
   - no `Failed to load`, no mod resolution failure and no stack frame from `dev.mcsupermods`.

It prints the key lines (the mod list, the registration line, `Done`) and then `PASS` or each `FAIL` reason.

## Where it runs

CI's `engine-mod` job (`.github/workflows/ci.yml`) runs it on `fixtures/sample-mod` after `./gradlew build`. Locally it needs JDK 25 and network access to meta.fabricmc.net, maven.fabricmc.net and Mojang's download servers; a warm run takes about 30 s.

Downloads are untrusted data: they are only stored and run as the Fabric server they claim to be, inside the run folder.
