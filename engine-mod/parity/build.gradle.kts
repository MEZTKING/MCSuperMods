plugins {
    id("net.fabricmc.fabric-loom") // version from settings.gradle.kts (loom_version)
}

version = providers.gradleProperty("mod_version").get()
group = providers.gradleProperty("maven_group").get()

base {
    archivesName = providers.gradleProperty("archives_base_name").get()
}

// A black-box GameTest mod (ADR 0033 D5): src/main is the test mod itself, run on a production
// dedicated server by tools/run-fabric-server --gametest against a content jar (msm_runtime
// nested) and against an ejected project's jar. It sees only Minecraft and Fabric API: no
// dependency on msm_runtime, no Loom test source set, no fabricApi { configureTests }.
dependencies {
    minecraft("com.mojang:minecraft:${providers.gradleProperty("minecraft_version").get()}")
    implementation("net.fabricmc:fabric-loader:${providers.gradleProperty("loader_version").get()}")
    implementation("net.fabricmc.fabric-api:fabric-api:${providers.gradleProperty("fabric_api_version").get()}")
}

tasks.processResources {
    val version = project.version
    inputs.property("version", version)
    filesMatching("fabric.mod.json") {
        expand("version" to version)
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
