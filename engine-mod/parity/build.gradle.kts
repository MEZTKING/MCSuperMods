import java.io.StringReader
import java.util.Properties

plugins {
    id("net.fabricmc.fabric-loom") // version from settings.gradle.kts (loom_version)
}

// `-Pmc=<version>` (default: ../gradle.properties default_mc) reads the Minecraft and Fabric facts and the
// fabric.mod.json "minecraft" range from ../versions/<version>.properties (ADR 0038 D5).
fun loadProperties(path: String): Properties {
    val file = layout.projectDirectory.file(path)
    require(file.asFile.isFile) { "No engine-mod/parity/$path" }
    return Properties().also { it.load(StringReader(providers.fileContents(file).asText.get())) }
}
val mc: String = providers.gradleProperty("mc").orNull
    ?: loadProperties("../gradle.properties").getProperty("default_mc")?.trim()
    ?: error("../gradle.properties has no default_mc")
val versionFacts: Properties = loadProperties("../versions/$mc.properties")

fun fact(name: String): String = versionFacts.getProperty(name)?.trim() ?: error("versions/$mc.properties has no $name")

version = providers.gradleProperty("mod_version").get() + "+mc$mc"
group = providers.gradleProperty("maven_group").get()

base {
    archivesName = providers.gradleProperty("archives_base_name").get()
}

// A black-box GameTest mod (ADR 0033 D5): src/main is the test mod itself, run on a production
// dedicated server by tools/run-fabric-server --gametest against a content jar (msm_runtime
// nested) and against an ejected project's jar. It sees only Minecraft and Fabric API: no
// dependency on msm_runtime, no Loom test source set, no fabricApi { configureTests }.
dependencies {
    minecraft("com.mojang:minecraft:${fact("minecraft_version")}")
    implementation("net.fabricmc:fabric-loader:${fact("loader_version")}")
    implementation("net.fabricmc.fabric-api:fabric-api:${fact("fabric_api_version")}")
}

// The worldgen parity fixture (ADR 0119 D13, B579): the committed expectations and the target id go
// into this jar; the lowered data pack of this version's `worldgen_parity` project goes into a jar of
// its own (`worldgenFixtureJar`, B581), which only the `worldgenParity` task loads, so its data
// (among it its own values for the noise ids `minecraft:surface`, `surface_secondary` and
// `clay_bands_offset`) is never active in any other parity run that uses this jar.
val worldgenFixture: Directory = layout.projectDirectory.dir("../../fixtures/worldgen-parity")

tasks.processResources {
    val worldgenTarget = "mc-$mc"
    val version = project.version
    val minecraftDependency = fact("minecraft_dependency")
    inputs.property("version", version)
    inputs.property("minecraftDependency", minecraftDependency)
    inputs.property("worldgenTarget", worldgenTarget)
    filesMatching("fabric.mod.json") {
        expand("version" to version, "minecraft_dependency" to minecraftDependency)
    }
    filesMatching("worldgen_parity/target.properties") {
        expand("target" to worldgenTarget)
    }
    from(worldgenFixture) {
        include("expectations.json")
        into("worldgen_parity")
    }
}

// Version overlay (ADR 0038 D2): src/mc/<mc>/java joins the main source set; it holds only the seams
// (one implementation per version, same class name).
val overlayDir = layout.projectDirectory.dir("src/mc/$mc/java")
require(overlayDir.asFile.isDirectory) { "No engine-mod/parity/src/mc/$mc/java: every version provides its seams" }
sourceSets.main { java.srcDir(overlayDir) }

tasks.withType<JavaCompile>().configureEach {
    options.release = 25
    options.encoding = "UTF-8"
}

java {
    sourceCompatibility = JavaVersion.VERSION_25
    targetCompatibility = JavaVersion.VERSION_25
}

// The fixture's data pack as a mod of its own (B581): `fabric.mod.json` from src/worldgen-fixture, this
// version's `lowered/data/` and `vanilla/data/`. Only worldgenParity and worldgenVanilla put it in mods/.
val worldgenFixtureJar = tasks.register<Jar>("worldgenFixtureJar") {
    group = "build"
    description = "The worldgen parity fixture's data pack as a mod jar of its own (only worldgenParity loads it)."
    val worldgenTarget = "mc-$mc"
    val version = project.version
    archiveBaseName = "msm_worldgen_parity_fixture"
    archiveVersion = version.toString()
    destinationDirectory = layout.buildDirectory.dir("worldgen-fixture")
    inputs.property("version", version)
    from(layout.projectDirectory.dir("src/worldgen-fixture")) {
        include("fabric.mod.json")
        expand("version" to version)
    }
    from(worldgenFixture.dir("$worldgenTarget/lowered")) {
        include("data/**")
    }
    // MSM's own test dimensions over vanilla's noise settings, for worldgenVanilla.
    from(worldgenFixture.dir("vanilla")) {
        include("data/**")
    }
}

// WorldgenParityTest on a production GameTest server (B579, ADR 0119 D13): tools/run-fabric-server
// runs this jar's worldgen_parity_* tests, with the fixture jar (`worldgenFixtureJar`) as the mod
// under test. `-PupdateWorldgenParity` makes the test write this version's section of
// fixtures/worldgen-parity/expectations.json instead of checking it. Needs node and JDK 25 on PATH.
tasks.register<Exec>("worldgenParity") {
    group = "verification"
    description = "Measures the worldgen parity fixture on the real game and checks (or with -PupdateWorldgenParity rewrites) its expectations."
    dependsOn(tasks.jar, worldgenFixtureJar)
    val jarFile = tasks.jar.flatMap { it.archiveFile }
    val fixtureJarFile = worldgenFixtureJar.flatMap { it.archiveFile }
    val repository = layout.projectDirectory.dir("../..").asFile
    val expectations = worldgenFixture.file("expectations.json").asFile
    val work = layout.buildDirectory.dir("worldgen-parity-server").get().asFile
    val report = layout.buildDirectory.file("worldgen-parity-report.xml").get().asFile
    val minecraft = fact("minecraft_version")
    val loader = fact("loader_version")
    val fabricApi = fact("fabric_api_version")
    val update = providers.gradleProperty("updateWorldgenParity").isPresent
    inputs.file(jarFile)
    inputs.file(fixtureJarFile)
    outputs.upToDateWhen { false }
    workingDir = repository
    executable = "node"
    argumentProviders.add(CommandLineArgumentProvider {
        val jar = jarFile.get().asFile.absolutePath
        listOf(
            "tools/run-fabric-server/index.ts",
            "--jar", fixtureJarFile.get().asFile.absolutePath, "--no-runtime",
            "--gametest", jar, "--gametest-filter", "msm_parity_tests:worldgen_parity_*",
            "--minecraft", minecraft, "--loader", loader, "--fabric-api", fabricApi,
            "--work", work.absolutePath, "--report", report.absolutePath,
        )
    })
    if (update) environment("MSM_WORLDGEN_PARITY_WRITE", expectations.absolutePath)
}

// The vanilla step of ADR 0119 D13 (B581): WorldgenParityTest.measuresVanillaSettings measures the fixture
// jar's MSM-own test dimensions over vanilla's own noise settings into build/worldgen-vanilla/measured.json
// (never committed: it holds vanilla's land); `@msm/terrain`'s test/vanilla-parity.test.ts then plays it
// through the engine with the Loom cache jar's files (MSM_WORLDGEN_VANILLA=<that file>).
tasks.register<Exec>("worldgenVanilla") {
    group = "verification"
    description = "Measures the worldgen parity fixture's test dimensions over vanilla's noise settings on the real game."
    dependsOn(tasks.jar, worldgenFixtureJar)
    val jarFile = tasks.jar.flatMap { it.archiveFile }
    val fixtureJarFile = worldgenFixtureJar.flatMap { it.archiveFile }
    val repository = layout.projectDirectory.dir("../..").asFile
    val work = layout.buildDirectory.dir("worldgen-vanilla-server").get().asFile
    val report = layout.buildDirectory.file("worldgen-vanilla-report.xml").get().asFile
    val measured = layout.buildDirectory.file("worldgen-vanilla/measured.json").get().asFile
    val minecraft = fact("minecraft_version")
    val loader = fact("loader_version")
    val fabricApi = fact("fabric_api_version")
    inputs.file(jarFile)
    inputs.file(fixtureJarFile)
    outputs.upToDateWhen { false }
    workingDir = repository
    executable = "node"
    argumentProviders.add(CommandLineArgumentProvider {
        listOf(
            "tools/run-fabric-server/index.ts",
            "--jar", fixtureJarFile.get().asFile.absolutePath, "--no-runtime",
            "--gametest", jarFile.get().asFile.absolutePath,
            "--gametest-filter", "msm_parity_tests:worldgen_parity_test_measures_vanilla_settings",
            "--minecraft", minecraft, "--loader", loader, "--fabric-api", fabricApi,
            "--work", work.absolutePath, "--report", report.absolutePath,
        )
    })
    environment("MSM_WORLDGEN_VANILLA_OUT", measured.absolutePath)
    environment("MSM_WORLDGEN_MINECRAFT", minecraft)
}

// The live views parity fixture (ADR 0120 D9, B607): fixtures/live-views/lowered/data as a mod jar of its own, loaded
// only by liveViewsParity, so its wool loot tables, merged and replaced vanilla tags and load function are never
// active in another parity run. One data pack serves every version (the data format is the same on both targets).
val liveViewsFixture: Directory = layout.projectDirectory.dir("../../fixtures/live-views")

val liveViewsFixtureJar = tasks.register<Jar>("liveViewsFixtureJar") {
    group = "build"
    description = "The live views parity fixture's data pack as a mod jar of its own (only liveViewsParity loads it)."
    val version = project.version
    archiveBaseName = "msm_live_views_fixture"
    archiveVersion = version.toString()
    destinationDirectory = layout.buildDirectory.dir("live-views-fixture")
    inputs.property("version", version)
    from(layout.projectDirectory.dir("src/live-views-fixture")) {
        include("fabric.mod.json")
        expand("version" to version)
    }
    from(liveViewsFixture.dir("lowered")) {
        include("data/**")
    }
}

// LiveViewsDataParityTest on a production GameTest server (B607): tools/run-fabric-server runs this jar's
// live_views_data_parity_test_* tests with the fixture jar as the mod under test, and the tests check this version's
// section of fixtures/live-views/expectations.json (or, with -PupdateLiveViewsParity, rewrite it). Needs node and JDK 25.
tasks.register<Exec>("liveViewsParity") {
    group = "verification"
    description = "Measures the live views parity fixture on the real game and checks (or with -PupdateLiveViewsParity rewrites) its expectations."
    dependsOn(tasks.jar, liveViewsFixtureJar)
    val jarFile = tasks.jar.flatMap { it.archiveFile }
    val fixtureJarFile = liveViewsFixtureJar.flatMap { it.archiveFile }
    val repository = layout.projectDirectory.dir("../..").asFile
    val expectations = liveViewsFixture.file("expectations.json").asFile
    val work = layout.buildDirectory.dir("live-views-parity-server").get().asFile
    val report = layout.buildDirectory.file("live-views-parity-report.xml").get().asFile
    val minecraft = fact("minecraft_version")
    val loader = fact("loader_version")
    val fabricApi = fact("fabric_api_version")
    val update = providers.gradleProperty("updateLiveViewsParity").isPresent
    inputs.file(jarFile)
    inputs.file(fixtureJarFile)
    outputs.upToDateWhen { false }
    workingDir = repository
    executable = "node"
    argumentProviders.add(CommandLineArgumentProvider {
        listOf(
            "tools/run-fabric-server/index.ts",
            "--jar", fixtureJarFile.get().asFile.absolutePath, "--no-runtime",
            "--gametest", jarFile.get().asFile.absolutePath,
            "--gametest-filter", "msm_parity_tests:live_views_data_parity_test_*",
            "--minecraft", minecraft, "--loader", loader, "--fabric-api", fabricApi,
            "--work", work.absolutePath, "--report", report.absolutePath,
        )
    })
    environment("MSM_LIVE_VIEWS_EXPECTATIONS", expectations.absolutePath)
    environment("MSM_LIVE_VIEWS_TARGET", "mc-$mc")
    if (update) environment("MSM_LIVE_VIEWS_UPDATE", "1")
}
