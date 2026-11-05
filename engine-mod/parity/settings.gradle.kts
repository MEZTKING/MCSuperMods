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
    plugins {
        id("net.fabricmc.fabric-loom") version providers.gradleProperty("loom_version").get()
    }
}

rootProject.name = "msm_parity_tests"
