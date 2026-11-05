import java.util.Properties

plugins {
    id("net.fabricmc.fabric-loom") // version from settings.gradle.kts (loom_version)
}

// `-Pmc=<version>` reads the Minecraft and Fabric facts from ../versions/<version>.properties
// (ADR 0038 D5, B151 spike; B159 finishes it). Without it gradle.properties holds them as before.
val mc: String? = providers.gradleProperty("mc").orNull
val versionFacts: Properties? =
    mc?.let { selected ->
        val file = layout.projectDirectory.file("../versions/$selected.properties").asFile
        require(file.isFile) { "No engine-mod/versions/$selected.properties for -Pmc=$selected" }
        Properties().also { properties -> file.inputStream().use { properties.load(it) } }
    }

fun fact(name: String): String =
    if (versionFacts == null) {
        providers.gradleProperty(name).get()
    } else {
        versionFacts.getProperty(name) ?: error("versions/$mc.properties has no $name")
    }

version = providers.gradleProperty("mod_version").get() + (mc?.let { "+mc$it" } ?: "")
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

// B151 spike overlay (ADR 0038 D2; B159 replaces it with seams): with -Pmc, src/mc/<mc>/java joins the
// main source set and each file it holds replaces the file of the same relative path in src/main/java.
val overlayDir = mc?.let { layout.projectDirectory.dir("src/mc/$it/java").asFile }
if (overlayDir != null && overlayDir.isDirectory) {
    val sharedDir = layout.projectDirectory.dir("src/main/java").asFile.absolutePath + File.separator
    val replaced: Set<String> =
        overlayDir.walkTopDown().filter { it.isFile }.map { it.relativeTo(overlayDir).invariantSeparatorsPath }.toSet()
    sourceSets.main { java.srcDir(overlayDir) }
    tasks.compileJava {
        exclude { it.file.absolutePath.startsWith(sharedDir) && it.relativePath.pathString in replaced }
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.release = 25
    options.encoding = "UTF-8"
}

java {
    sourceCompatibility = JavaVersion.VERSION_25
    targetCompatibility = JavaVersion.VERSION_25
}
