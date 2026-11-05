plugins {
    id("net.fabricmc.fabric-loom")
}

version = providers.gradleProperty("mod_version").get()
group = providers.gradleProperty("maven_group").get()

base {
    archivesName = providers.gradleProperty("archives_base_name").get()
}

repositories {
    // GeckoLib from the Modrinth Maven.
    exclusiveContent {
        forRepository {
            maven {
                name = "Modrinth"
                url = uri("https://api.modrinth.com/maven")
            }
        }
        filter { includeGroup("maven.modrinth") }
    }
}

dependencies {
    minecraft("com.mojang:minecraft:${providers.gradleProperty("minecraft_version").get()}")
    implementation("net.fabricmc:fabric-loader:${providers.gradleProperty("loader_version").get()}")
    implementation("net.fabricmc.fabric-api:fabric-api:${providers.gradleProperty("fabric_api_version").get()}")
    // GeckoLib, nested in the built jar (jar-in-jar). Loom prints "(<id>) is not valid semver"
    // for the Modrinth version id; that line is harmless.
    val geckolib = "maven.modrinth:geckolib:${providers.gradleProperty("geckolib_modrinth_version_id").get()}"
    implementation(geckolib)
    include(geckolib)
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
