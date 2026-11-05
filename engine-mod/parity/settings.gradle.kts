// Behaviour-parity GameTests (ADR 0033 D5): a separate Gradle build, run from engine-mod with
// `./gradlew -p parity build`. Plugin repositories and versions as engine-mod/settings.gradle.kts.
pluginManagement {
    repositories {
        maven {
            name = "Fabric"
            url = uri("https://maven.fabricmc.net/")
        }
        mavenCentral()
        gradlePluginPortal()
    }
    // `-Pmc=<version>` (default: ../gradle.properties default_mc) selects ../versions/<version>.properties
    // (ADR 0038 D5); only loom_version is read here, build.gradle.kts reads the rest.
    fun load(path: String): java.util.Properties {
        require(settingsDir.resolve(path).isFile) { "No engine-mod/parity/$path" }
        return java.util.Properties().also {
            it.load(java.io.StringReader(providers.fileContents(layout.rootDirectory.file(path)).asText.get()))
        }
    }
    val mc: String = providers.gradleProperty("mc").orNull
        ?: load("../gradle.properties").getProperty("default_mc")?.trim()
        ?: error("../gradle.properties has no default_mc")
    val loomVersion: String =
        load("../versions/$mc.properties").getProperty("loom_version")?.trim()?.ifBlank { null }
            ?: error("versions/$mc.properties has no loom_version")
    plugins {
        id("net.fabricmc.fabric-loom") version loomVersion
    }
}

rootProject.name = "msm_parity_tests"
