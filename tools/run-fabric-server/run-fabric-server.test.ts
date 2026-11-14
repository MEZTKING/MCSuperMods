import { describe, expect, it } from 'vitest';
import {
  analyseLog,
  checkGameTests,
  fabricApiModuleUrl,
  fabricApiPomUrl,
  fabricApiUrl,
  GAMETEST_MODULE,
  geckolibCachePath,
  latestStableInstaller,
  missingLines,
  moduleVersionFromPom,
  parseArgs,
  parseGameTestReport,
  reportPath,
  runLogName,
  serverArguments,
  serverLauncherUrl,
  serverProperties,
} from './index.ts';

const MODS = [
  '[10:03:50] [main/INFO]: Loading 44 mods:',
  '\t- fabric-api 0.165.2+1.0',
  '\t- msm_sample_mod 1.0.0',
  '\t   \\-- msm_runtime 0.0.1',
];
const REGISTERED =
  '[10:04:02] [main/INFO]: [msm_runtime] registered 3 block(s) and 6 item(s) from 7 definition file(s); 0 error(s), 0 warning(s)';
const DONE = '[10:04:06] [Server thread/INFO]: Done (0.787s)! For help, type "help"';
const OFFLINE = '[10:04:05] [Server thread/WARN]: **** SERVER IS RUNNING IN OFFLINE/INSECURE MODE!';
const expect3 = { expectBlocks: 3, expectItems: 6, allowWarnings: false };

describe('analyseLog', () => {
  it('passes a clean start and keeps the key lines', () => {
    const analysis = analyseLog([...MODS, REGISTERED, OFFLINE, DONE], expect3);
    expect(analysis.failures).toEqual([]);
    expect(analysis.ok).toBe(true);
    expect([analysis.blocks, analysis.items, analysis.files, analysis.errors]).toEqual([
      3, 6, 7, 0,
    ]);
    expect(analysis.keyLines).toEqual([...MODS, REGISTERED, DONE]);
  });

  it('fails on wrong counts, runtime errors and a missing Done', () => {
    const line = REGISTERED.replace('3 block(s)', '2 block(s)').replace('0 error(s)', '1 error(s)');
    const analysis = analyseLog(
      [line, '[10:04:02] [main/ERROR]: [msm_runtime] msm/x/block/a.json: bad'],
      expect3,
    );
    expect(analysis.ok).toBe(false);
    expect(analysis.failures).toEqual([
      'runtime error: [10:04:02] [main/ERROR]: [msm_runtime] msm/x/block/a.json: bad',
      'the server never logged "Done (" (it did not finish starting)',
      'the runtime reported 1 error(s)',
      'expected 3 block(s), the runtime registered 2',
    ]);
  });

  it('fails without the registration line', () => {
    expect(analyseLog([DONE], expect3).failures).toEqual([
      'no "[msm_runtime] registered ..." line: the runtime did not load or scan',
    ]);
  });

  it('fails on late runtime warnings unless they are allowed', () => {
    const warning =
      '[10:04:55] [Server thread/WARN]: [msm_runtime] msm/a/block/b.json (mod a): unknown run_function function a:c';
    const lines = [REGISTERED, DONE, warning];
    expect(analyseLog(lines, expect3).ok).toBe(false);
    expect(analyseLog(lines, { ...expect3, allowWarnings: true }).ok).toBe(true);
  });

  it('fails on load failures and runtime stack frames', () => {
    const analysis = analyseLog(
      [
        REGISTERED,
        DONE,
        '[main/ERROR]: Failed to load something',
        '\tat dev.mcsupermods.runtime.registry.MsmRegistrar.registerAll(MsmRegistrar.java:80)',
        'net.fabricmc.loader.impl.FormattedException: Mod resolution failed',
      ],
      { expectBlocks: undefined, expectItems: undefined, allowWarnings: false },
    );
    expect(analysis.failures.map((failure) => failure.split(':')[0])).toEqual([
      'load failure',
      'exception in msm_runtime',
      'load failure',
    ]);
  });
});

describe('analyseLog with entities and GeckoLib', () => {
  const MOB_MODS = [
    '[17:33:58] [main/INFO]: Loading 46 mods:',
    '\t- msm_sample_mob 1.0.0',
    '\t   |-- geckolib 5.5.7',
    '\t   \\-- msm_runtime 0.4.0',
  ];
  const MOB_REGISTERED =
    '[17:34:07] [main/INFO]: [msm_runtime] registered 0 block(s) and 1 item(s) from 1 definition file(s); 0 error(s), 0 warning(s)';
  const ENTITIES = '[17:34:07] [main/INFO]: [msm_runtime] registered 1 entity type(s)';
  const expectMob = { expectBlocks: 0, expectItems: 1, expectEntities: 1, allowWarnings: false };

  it('passes with the entity line and keeps it and the nested GeckoLib as key lines', () => {
    const analysis = analyseLog(
      [...MOB_MODS, MOB_REGISTERED, ENTITIES, '[main/INFO]: GeckoLib loaded', OFFLINE, DONE],
      expectMob,
    );
    expect(analysis.failures).toEqual([]);
    expect(analysis.ok).toBe(true);
    expect([analysis.blocks, analysis.items, analysis.entities]).toEqual([0, 1, 1]);
    expect(analysis.keyLines).toEqual([...MOB_MODS, MOB_REGISTERED, ENTITIES, DONE]);
  });

  it('fails on a wrong or missing entity count, and on a repeated line', () => {
    const wrong = analyseLog(
      [MOB_REGISTERED, ENTITIES.replace('1 entity', '0 entity'), DONE],
      expectMob,
    );
    expect(wrong.failures).toEqual(['expected 1 entity type(s), the runtime registered 0']);
    expect(analyseLog([MOB_REGISTERED, DONE], expectMob).failures).toEqual([
      'no "[msm_runtime] registered K entity type(s)" line',
    ]);
    expect(analyseLog([MOB_REGISTERED, ENTITIES, ENTITIES, DONE], expectMob).failures).toEqual([
      'the runtime reported its entity types twice',
    ]);
    // Without an expectation the entity line is optional.
    expect(analyseLog([REGISTERED, DONE], expect3).ok).toBe(true);
  });

  it('fails on GeckoLib warnings unless allowed, and always on its errors and stack frames', () => {
    const warning = '[17:34:01] [main/WARN]: Mixin config geckolib.mixins.json has a problem';
    const error = '[17:34:01] [main/ERROR]: [GeckoLib] Unsupported geo model format version';
    const frame = '\tat com.geckolib.loading.FileLoader.loadModelFile(FileLoader.java:40)';
    const base = [MOB_REGISTERED, ENTITIES, DONE];
    expect(analyseLog([...base, warning], expectMob).failures).toEqual([
      `GeckoLib warn: ${warning}`,
    ]);
    expect(analyseLog([...base, warning], { ...expectMob, allowWarnings: true }).ok).toBe(true);
    expect(
      analyseLog([...base, error, frame], { ...expectMob, allowWarnings: true }).failures.map(
        (failure) => failure.split(':')[0],
      ),
    ).toEqual(['GeckoLib error', 'exception in msm_runtime']);
  });
});

describe('parseArgs', () => {
  const facts = { minecraft: '1.0', loader: '0.1.0', fabricApi: '0.2.0+1.0', expectBlocks: 3 };

  it('takes versions from the facts file and flags over them', () => {
    const options = parseArgs(
      ['--jar', 'a.jar', '--loader', '0.9.0', '--extra', 'r.jar', '--allow-warnings'],
      facts,
      { JAVA_HOME: '/jdk' },
    );
    expect(options).toMatchObject({
      jar: 'a.jar',
      extra: ['r.jar'],
      minecraft: '1.0',
      loader: '0.9.0',
      fabricApi: '0.2.0+1.0',
      expectBlocks: 3,
      expectItems: undefined,
      allowWarnings: true,
      timeoutSeconds: 900,
    });
    expect(options.java.replaceAll('\\', '/')).toBe('/jdk/bin/java');
  });

  it('reads entity and GeckoLib facts and the GeckoLib flags', () => {
    const geckolib = {
      fileName: 'geckolib-fabric-1.0-2.0.0.jar',
      url: 'https://cdn.example/geckolib-fabric-1.0-2.0.0.jar',
      sha512: 'ab'.repeat(64),
    };
    const fromFacts = parseArgs(['--jar', 'a.jar'], { ...facts, expectEntities: 1, geckolib });
    expect(fromFacts).toMatchObject({ expectEntities: 1, geckolib, separateGeckolib: false });
    const flagged = parseArgs(['--jar', 'a.jar', '--expect-entities', '2', '--separate-geckolib'], {
      ...facts,
      expectEntities: 1,
      geckolib,
    });
    expect(flagged).toMatchObject({ expectEntities: 2, separateGeckolib: true });
    expect(() => parseArgs(['--jar', 'a.jar', '--separate-geckolib'], facts)).toThrow(
      /needs the geckolib entry/,
    );
    expect(() => parseArgs(['--jar', 'a.jar', '--expect-entities', '-1'], facts)).toThrow(/whole/);
  });

  it('rejects missing and unknown options', () => {
    expect(() => parseArgs([], facts)).toThrow(/--jar is required/);
    expect(() => parseArgs(['--jar', 'a.jar'])).toThrow(/--minecraft is required/);
    expect(() => parseArgs(['--jar', 'a.jar', '--colour', 'red'], facts)).toThrow(/Unknown option/);
    expect(() => parseArgs(['--jar', 'a.jar', '--expect-items', 'x'], facts)).toThrow(/whole/);
  });
});

describe('URLs and files', () => {
  it('builds the meta and maven URLs', () => {
    expect(serverLauncherUrl('1.0', '0.1.0', '1.1.2')).toBe(
      'https://meta.fabricmc.net/v2/versions/loader/1.0/0.1.0/1.1.2/server/jar',
    );
    expect(fabricApiUrl('0.2.0+1.0')).toBe(
      'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.2.0+1.0/fabric-api-0.2.0+1.0.jar',
    );
  });

  it('picks the first stable installer', () => {
    expect(
      latestStableInstaller([
        { version: '2.0.0-beta', stable: false },
        { version: '1.1.2', stable: true },
        { version: '1.1.1', stable: true },
      ]),
    ).toBe('1.1.2');
    expect(() => latestStableInstaller([])).toThrow(/no stable/);
  });

  it('caches GeckoLib under its own file name only', () => {
    const facts = { url: 'https://cdn.example/g.jar', sha512: 'ab'.repeat(64) };
    expect(
      geckolibCachePath('/cache', {
        ...facts,
        fileName: 'geckolib-fabric-1.0-2.0.0.jar',
      }).replaceAll('\\', '/'),
    ).toBe('/cache/geckolib-fabric-1.0-2.0.0.jar');
    expect(() => geckolibCachePath('/cache', { ...facts, fileName: '../evil.jar' })).toThrow(
      /plain \.jar/,
    );
    expect(() => geckolibCachePath('/cache', { ...facts, fileName: 'geckolib.zip' })).toThrow(
      /plain \.jar/,
    );
  });

  it('writes an offline server.properties on the given port', () => {
    const text = serverProperties(41234);
    expect(text).toContain('online-mode=false\n');
    expect(text).toContain('server-port=41234\n');
  });
});

describe('GameTest runs', () => {
  // Reports as Fabric API 4.0.36's runner wrote them on 26.3 (B131 runs, positions shortened).
  const PASSED =
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?><testsuite><testsuite time="5.614" timestamp="2026-11-05T18:14:41.823108274Z"><testcase classname="minecraft:empty" name="minecraft:always_pass" time="0.002"/><testcase classname="fabric-gametest-api-v1:empty" name="msm_parity_tests:sample_mod_parity_test_ruby_ore_is_registered" time="0.0"/></testsuite></testsuite>';
  const FAILED =
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?><testsuite><testsuite time="8.136" timestamp="2026-11-05T18:17:32.225852800Z"><testcase classname="minecraft:empty" name="minecraft:always_pass" time="0.004"/><testcase classname="fabric-gametest-api-v1:empty" name="msm_parity_tests:sample_mod_parity_test_ruby_ore_is_registered" time="0.01"><failure message="(-1, 4, 1) block msm_sample_mod:ruby_ore is not registered on tick 0"/></testcase></testsuite></testsuite>';
  const TEST = 'msm_parity_tests:sample_mod_parity_test_ruby_ore_is_registered';
  const MESSAGE = '(-1, 4, 1) block msm_sample_mod:ruby_ore is not registered on tick 0';

  it('reads passed, failed and skipped test cases from the report', () => {
    expect(parseGameTestReport(PASSED)).toEqual([
      {
        name: 'minecraft:always_pass',
        classname: 'minecraft:empty',
        failure: undefined,
        skipped: undefined,
      },
      {
        name: TEST,
        classname: 'fabric-gametest-api-v1:empty',
        failure: undefined,
        skipped: undefined,
      },
    ]);
    expect(parseGameTestReport(FAILED)[1]).toMatchObject({ name: TEST, failure: MESSAGE });
    const other = parseGameTestReport(
      '<testsuite><testcase name="a:b" classname="c"><failure>x &lt; y &amp; &quot;z&quot;</failure></testcase><testcase name="a:&#99;"><skipped message="optional"/></testcase></testsuite>',
    );
    expect(other).toEqual([
      { name: 'a:b', classname: 'c', failure: 'x < y & "z"', skipped: undefined },
      { name: 'a:c', classname: '', failure: undefined, skipped: 'optional' },
    ]);
  });

  it('passes on exit 0 with a clean report that lists a test of the jar', () => {
    const outcome = checkGameTests(PASSED, 0);
    expect(outcome.failures).toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(outcome.tests.map((test) => test.name)).toEqual(['minecraft:always_pass', TEST]);
  });

  it('fails naming the test, and on the exit status', () => {
    expect(checkGameTests(FAILED, 1).failures).toEqual([
      `GameTest failed: ${TEST}: ${MESSAGE}`,
      'the GameTest server exited with status 1 (the number of failed required tests, or 1 for a crash)',
    ]);
    // A failed optional test is in the report but not in the exit status: still a failure here.
    expect(checkGameTests(FAILED, 0).ok).toBe(false);
  });

  it('fails without a report, without a test from the jar and on -1 or a kill', () => {
    expect(checkGameTests(undefined, 255).failures).toEqual([
      'the GameTest server wrote no report (it did not get to run the tests)',
      'the GameTest server exited with status 255 (no tests could be selected, or the server failed to start)',
    ]);
    const vanillaOnly =
      '<testsuite><testsuite><testcase classname="minecraft:empty" name="minecraft:always_pass" time="0.0"/></testsuite></testsuite>';
    expect(checkGameTests(vanillaOnly, 0).failures).toEqual([
      'the GameTest report lists no test from the --gametest jar',
    ]);
    expect(checkGameTests(PASSED, null).failures).toEqual([
      'the GameTest server exited with status null (it was killed)',
    ]);
  });

  it('does not need "Done (" in a GameTest run, and still checks the runtime', () => {
    const lines = [REGISTERED, '[18:14:44] [Server thread/INFO]: Started game test server'];
    expect(analyseLog(lines, { ...expect3, gametest: true }).failures).toEqual([]);
    expect(analyseLog(lines, expect3).ok).toBe(false);
    expect(analyseLog([], { ...expect3, gametest: true }).failures).toEqual([
      'no "[msm_runtime] registered ..." line: the runtime did not load or scan',
    ]);
    const crash = '[18:17:40] [Server thread/ERROR]: Game test server crashed';
    expect(analyseLog([REGISTERED, crash], { ...expect3, gametest: true }).failures).toEqual([
      `the GameTest server crashed: ${crash}`,
    ]);
  });

  it('counts knot frames from the runtime and GeckoLib, not from the parity tests', () => {
    const runtimeFrame =
      '\tat knot//dev.mcsupermods.runtime.registry.MsmRegistrar.registerAll(MsmRegistrar.java:80)';
    const geckolibFrame = '\tat knot//com.geckolib.loading.FileLoader.load(FileLoader.java:40)';
    const parityFrame =
      '\tat knot//dev.mcsupermods.parity.SampleModParityTest.rubyOreIsRegistered(SampleModParityTest.java:23)';
    const analysis = analyseLog([REGISTERED, runtimeFrame, geckolibFrame, parityFrame], {
      ...expect3,
      gametest: true,
    });
    expect(analysis.failures).toEqual([
      `exception in msm_runtime: ${runtimeFrame.trim()}`,
      `exception in msm_runtime: ${geckolibFrame.trim()}`,
    ]);
  });
});

describe('--no-runtime', () => {
  const expectNone = { expectBlocks: 3, expectItems: 6, expectEntities: 1, allowWarnings: false };

  it('skips the registration checks for an ejected jar', () => {
    const analysis = analyseLog([...MODS.slice(0, 3), DONE], { ...expectNone, noRuntime: true });
    expect(analysis.failures).toEqual([]);
    expect(analysis.blocks).toBeUndefined();
  });

  it('fails on any msm_runtime line', () => {
    const analysis = analyseLog([REGISTERED, DONE], { ...expectNone, noRuntime: true });
    expect(analysis.failures).toEqual([
      `msm_runtime is loaded, but --no-runtime says it is not: ${REGISTERED}`,
    ]);
  });

  it('still requires "Done (" outside GameTest runs', () => {
    expect(analyseLog([], { ...expectNone, noRuntime: true }).failures).toEqual([
      'the server never logged "Done (" (it did not finish starting)',
    ]);
  });
});

describe('analyseLog with scripts', () => {
  const LOADED = '[10:04:03] [Server thread/INFO]: [msm_runtime] loaded 11 script(s); 0 error(s)';
  const SCRIPT_INFO =
    '[10:04:06] [Server thread/INFO]: [msm_runtime] msm_sample_script:on_server_started: server.started';
  const expectScripts = { ...expect3, expectScripts: 11 };

  it("passes with the loaded line and keeps it and the scripts' log lines", () => {
    const analysis = analyseLog([REGISTERED, LOADED, SCRIPT_INFO, DONE], expectScripts);
    expect(analysis.failures).toEqual([]);
    expect(analysis.scripts).toBe(11);
    expect(analysis.keyLines).toEqual([REGISTERED, LOADED, SCRIPT_INFO, DONE]);
  });

  it('fails on a wrong count, script errors, a missing or a repeated line', () => {
    const wrong = LOADED.replace('11 script', '10 script').replace('0 error', '2 error');
    expect(analyseLog([REGISTERED, wrong, DONE], expectScripts).failures).toEqual([
      'expected 11 script(s), the runtime loaded 10',
      'the runtime reported 2 script error(s)',
    ]);
    expect(analyseLog([REGISTERED, DONE], expectScripts).failures).toEqual([
      'no "[msm_runtime] loaded S script(s); E error(s)" line',
    ]);
    expect(analyseLog([REGISTERED, LOADED, LOADED, DONE], expectScripts).failures).toEqual([
      'the runtime reported loading its scripts twice',
    ]);
  });

  it('accepts the same load again in a GameTest run (a /reload), but no change or error', () => {
    const gametest = { ...expectScripts, gametest: true };
    expect(analyseLog([REGISTERED, LOADED, LOADED], gametest).failures).toEqual([]);
    const errors = LOADED.replace('0 error', '1 error');
    expect(analyseLog([REGISTERED, LOADED, errors], gametest).failures).toEqual([
      `the scripts loaded again differently: ${errors}`,
    ]);
    const fewer = LOADED.replace('11 script', '10 script');
    expect(analyseLog([REGISTERED, LOADED, fewer], gametest).failures).toEqual([
      `the scripts loaded again differently: ${fewer}`,
    ]);
  });

  it('leaves the line optional without expectScripts, and skips it with --no-runtime', () => {
    expect(analyseLog([REGISTERED, DONE], expect3).failures).toEqual([]);
    expect(analyseLog([DONE], { ...expectScripts, noRuntime: true }).failures).toEqual([]);
  });

  it('still fails on a script error logged by the runtime', () => {
    const error =
      '[10:04:03] [Server thread/ERROR]: [msm_runtime] script msm_sample_script:util: syntax error (msm/msm_sample_script/script/util.js#5)';
    expect(analyseLog([REGISTERED, LOADED, error, DONE], expectScripts).failures).toEqual([
      `runtime error: ${error.trim()}`,
    ]);
  });
});

describe('parseArgs for GameTests and scripts', () => {
  const facts = { minecraft: '1.0', loader: '0.1.0', fabricApi: '0.2.0+1.0' };

  it('reads --gametest, --report, --no-runtime and expectScripts', () => {
    expect(parseArgs(['--jar', 'a.jar'], { ...facts, expectScripts: 4 })).toMatchObject({
      gametest: undefined,
      report: undefined,
      noRuntime: false,
      expectScripts: 4,
    });
    expect(
      parseArgs(
        [
          '--jar',
          'a.jar',
          '--gametest',
          't.jar',
          '--report',
          'r.xml',
          '--no-runtime',
          '--expect-scripts',
          '2',
        ],
        { ...facts, expectScripts: 4 },
      ),
    ).toMatchObject({ gametest: 't.jar', report: 'r.xml', noRuntime: true, expectScripts: 2 });
    expect(() => parseArgs(['--jar', 'a.jar', '--report', 'r.xml'], facts)).toThrow(
      /--report needs --gametest/,
    );
    expect(() => parseArgs(['--jar', 'a.jar', '--expect-scripts', 'x'], facts)).toThrow(/whole/);
  });

  it('reads --gametest-filter, only with --gametest, and passes it to the JVM', () => {
    expect(
      parseArgs(
        [
          '--jar',
          'a.jar',
          '--gametest',
          't.jar',
          '--gametest-filter',
          'msm_parity_tests:sample_mod_*',
        ],
        facts,
      ),
    ).toMatchObject({ gametestFilter: 'msm_parity_tests:sample_mod_*' });
    expect(parseArgs(['--jar', 'a.jar', '--gametest', 't.jar'], facts).gametestFilter).toBe(
      undefined,
    );
    expect(() => parseArgs(['--jar', 'a.jar', '--gametest-filter', 'x:*'], facts)).toThrow(
      /--gametest-filter needs --gametest/,
    );
    expect(serverArguments('2G', 'l.jar', '/w/r.xml', 'x:y_*')).toEqual([
      '-Xmx2G',
      '-Dfabric-api.gametest=true',
      '-Dfabric-api.gametest.report-file=/w/r.xml',
      '-Dfabric-api.gametest.filter=x:y_*',
      '-jar',
      'l.jar',
      'nogui',
    ]);
  });

  it('puts the report in the run folder by default and passes it to the JVM', () => {
    const work = { workDir: '/work', report: undefined };
    expect(reportPath(work).replaceAll('\\', '/')).toMatch(/\/work\/gametest-report\.xml$/);
    expect(reportPath({ ...work, report: '/out/r.xml' }).replaceAll('\\', '/')).toMatch(
      /\/out\/r\.xml$/,
    );
    expect(serverArguments('2G', 'l.jar')).toEqual(['-Xmx2G', '-jar', 'l.jar', 'nogui']);
    expect(serverArguments('2G', 'l.jar', '/w/r.xml')).toEqual([
      '-Xmx2G',
      '-Dfabric-api.gametest=true',
      '-Dfabric-api.gametest.report-file=/w/r.xml',
      '-jar',
      'l.jar',
      'nogui',
    ]);
  });
});

describe('the GameTest module', () => {
  // Excerpt of fabric-api-0.165.2+26.3.pom: the module is a dependency, not nested in the jar.
  const POM = `<project><dependencies>
    <dependency>
      <groupId>net.fabricmc.fabric-api</groupId>
      <artifactId>fabric-client-gametest-api-v1</artifactId>
      <version>5.0.0+client</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>net.fabricmc.fabric-api</groupId>
      <artifactId>fabric-gametest-api-v1</artifactId>
      <version>4.0.36+3434d6d95d</version>
      <scope>compile</scope>
    </dependency>
  </dependencies></project>`;

  it('reads its version from Fabric API POM and builds its URLs', () => {
    expect(moduleVersionFromPom(POM, GAMETEST_MODULE)).toBe('4.0.36+3434d6d95d');
    expect(() => moduleVersionFromPom('<project/>', GAMETEST_MODULE)).toThrow(/names no version/);
    expect(fabricApiPomUrl('0.2.0+1.0')).toBe(
      'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.2.0+1.0/fabric-api-0.2.0+1.0.pom',
    );
    expect(fabricApiModuleUrl(GAMETEST_MODULE, '4.0.36+3434d6d95d')).toBe(
      'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-gametest-api-v1/4.0.36+3434d6d95d/fabric-gametest-api-v1-4.0.36+3434d6d95d.jar',
    );
  });
});

describe('two runs on one world', () => {
  const facts = { minecraft: '1.0', loader: '0.1.0', fabricApi: '0.2.0+1.0' };
  const COUNTER =
    '[10:04:06] [Server thread/INFO]: [msm_runtime] msm_sample_script:start_counter: start counter: 2';

  it('reads --runs and repeated --expect-line, and refuses --runs with --gametest', () => {
    expect(parseArgs(['--jar', 'a.jar'], facts)).toMatchObject({ runs: 1, expectLines: [] });
    expect(
      parseArgs(
        ['--jar', 'a.jar', '--runs', '2', '--expect-line', 'a {run}', '--expect-line', 'b'],
        facts,
      ),
    ).toMatchObject({ runs: 2, expectLines: ['a {run}', 'b'] });
    expect(() => parseArgs(['--jar', 'a.jar', '--runs', '0'], facts)).toThrow(/1 or more/);
    expect(() => parseArgs(['--jar', 'a.jar', '--runs', 'x'], facts)).toThrow(/whole/);
    expect(() =>
      parseArgs(['--jar', 'a.jar', '--runs', '2', '--gametest', 't.jar'], facts),
    ).toThrow(/--runs needs a plain start/);
  });

  it('finds expected line endings with the run number filled in', () => {
    const template = 'msm_sample_script:start_counter: start counter: {run}';
    expect(missingLines([COUNTER, DONE], [template], 2)).toEqual([]);
    expect(missingLines([COUNTER, DONE], [template], 1)).toEqual([
      'msm_sample_script:start_counter: start counter: 1',
    ]);
    // An ending, not a part: 12 is not 2's line.
    expect(missingLines([`${COUNTER.slice(0, -1)}12`], [template], 2)).toEqual([
      'msm_sample_script:start_counter: start counter: 2',
    ]);
    expect(missingLines([`${COUNTER}  `], [template], 2)).toEqual([]);
  });

  it('keeps the first run log name and numbers the later ones', () => {
    expect([runLogName(1), runLogName(2)]).toEqual([
      'run-fabric-server.log',
      'run-fabric-server-run2.log',
    ]);
  });
});
