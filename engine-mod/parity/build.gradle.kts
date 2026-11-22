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

// The worldgen parity fixture (ADR 0119 D13, B579): the lowered data pack of this version's
// `worldgen_parity` project goes into the jar as mod data, with the committed expectations and the
// target id, so WorldgenParityTest reads its dimensions from the server's resources.
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
    from(worldgenFixture.dir("$worldgenTarget/lowered")) {
        include("data/**")
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

// WorldgenParityTest on a production GameTest server (B579, ADR 0119 D13): tools/run-fabric-server
// runs this jar's worldgen_parity_* tests, with the jar as the mod under test (it holds the fixture).
// `-PupdateWorldgenParity` makes the test write this version's section of
// fixtures/worldgen-parity/expectations.json instead of checking it. Needs node and JDK 25 on PATH.
tasks.register<Exec>("worldgenParity") {
    group = "verification"
    description = "Measures the worldgen parity fixture on the real game and checks (or with -PupdateWorldgenParity rewrites) its expectations."
    dependsOn(tasks.jar)
    val jarFile = tasks.jar.flatMap { it.archiveFile }
    val repository = layout.projectDirectory.dir("../..").asFile
    val expectations = worldgenFixture.file("expectations.json").asFile
    val work = layout.buildDirectory.dir("worldgen-parity-server").get().asFile
    val report = layout.buildDirectory.file("worldgen-parity-report.xml").get().asFile
    val minecraft = fact("minecraft_version")
    val loader = fact("loader_version")
    val fabricApi = fact("fabric_api_version")
    val update = providers.gradleProperty("updateWorldgenParity").isPresent
    inputs.file(jarFile)
    outputs.upToDateWhen { false }
    workingDir = repository
    executable = "node"
    argumentProviders.add(CommandLineArgumentProvider {
        val jar = jarFile.get().asFile.absolutePath
        listOf(
            "tools/run-fabric-server/index.ts",
            "--jar", jar, "--no-runtime",
            "--gametest", jar, "--gametest-filter", "msm_parity_tests:worldgen_parity_*",
            "--minecraft", minecraft, "--loader", loader, "--fabric-api", fabricApi,
            "--work", work.absolutePath, "--report", report.absolutePath,
        )
    })
    if (update) environment("MSM_WORLDGEN_PARITY_WRITE", expectations.absolutePath)
}
