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

tasks.processResources {
    val version = project.version
    val minecraftDependency = fact("minecraft_dependency")
    inputs.property("version", version)
    inputs.property("minecraftDependency", minecraftDependency)
    filesMatching("fabric.mod.json") {
        expand("version" to version, "minecraft_dependency" to minecraftDependency)
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
