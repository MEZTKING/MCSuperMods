pluginManagement {
    repositories {
        maven {
            name = "Fabric"
            url = uri("https://maven.fabricmc.net/")
        }
        mavenCentral()
        gradlePluginPortal()
    }
    // `-Pmc=<version>` selects engine-mod/versions/<version>.properties (ADR 0038 D1, B151 spike);
    // without it gradle.properties holds the facts as before. Only loom_version is read here.
    val mc: String? = providers.gradleProperty("mc").orNull
    val loomVersion: String =
        if (mc == null) {
            providers.gradleProperty("loom_version").get()
        } else {
            val file = settingsDir.resolve("versions/$mc.properties")
            require(file.isFile) { "No engine-mod/versions/$mc.properties for -Pmc=$mc" }
            val properties = java.util.Properties()
            file.inputStream().use { properties.load(it) }
            properties.getProperty("loom_version") ?: error("versions/$mc.properties has no loom_version")
        }
    plugins {
        id("net.fabricmc.fabric-loom") version loomVersion
    }
}

rootProject.name = "msm_runtime"
