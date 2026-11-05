pluginManagement {
    repositories {
        maven {
            name = "Fabric"
            url = uri("https://maven.fabricmc.net/")
        }
        mavenCentral()
        gradlePluginPortal()
    }
    // `-Pmc=<version>` (default: gradle.properties default_mc) selects versions/<version>.properties
    // (ADR 0038 D1); only loom_version is read here, build.gradle.kts reads the rest.
    val mc: String = providers.gradleProperty("mc").orNull ?: providers.gradleProperty("default_mc").get()
    val versionFile = settingsDir.resolve("versions/$mc.properties")
    require(versionFile.isFile) { "No engine-mod/versions/$mc.properties for -Pmc=$mc" }
    val versionFacts = java.util.Properties()
    versionFacts.load(java.io.StringReader(providers.fileContents(layout.rootDirectory.file("versions/$mc.properties")).asText.get()))
    val loomVersion: String =
        versionFacts.getProperty("loom_version")?.trim()?.ifBlank { null } ?: error("versions/$mc.properties has no loom_version")
    plugins {
        id("net.fabricmc.fabric-loom") version loomVersion
    }
}

rootProject.name = "msm_runtime"
