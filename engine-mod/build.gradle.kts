plugins {
    id("net.fabricmc.fabric-loom") // version from settings.gradle.kts (loom_version)
}

version = providers.gradleProperty("mod_version").get()
group = providers.gradleProperty("maven_group").get()

base {
    archivesName = providers.gradleProperty("archives_base_name").get()
}

repositories {
    // Loom adds the Minecraft, Fabric and library repositories itself.
    // GeckoLib from the Modrinth Maven (the official GeckoLib Maven is not reachable from every build host; ADR 0029 D6).
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

    // Rhino (ADR 0031 D1): the plain runtime jar, unmodified, nested through Loom's jar-in-jar (`include`);
    // Loom generates a fabric.mod.json for it inside the nested jar.
    val rhino = "org.mozilla:rhino:${providers.gradleProperty("rhino_version").get()}"
    implementation(rhino)
    include(rhino)

    // JUnit 5 for the Codecs over the shared MSM conformance corpus (GameTests cover behaviour).
    testImplementation(platform("org.junit:junit-bom:${providers.gradleProperty("junit_version").get()}"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

// The corpus lives with the MSM mcdoc in packages/schemas; the runtime reads it in place.
val conformanceCorpus = layout.projectDirectory.dir("../packages/schemas/mcdoc/msm/conformance/definition")

tasks.test {
    useJUnitPlatform()
    inputs.dir(conformanceCorpus).withPropertyName("conformanceCorpus")
    systemProperty("msm.conformance.definition", conformanceCorpus.asFile.absolutePath)
    testLogging {
        events("failed")
        showStandardStreams = false
    }
}

fabricApi {
    // Creates the `gametest` source set and the `runGameTest` task (headless server).
    configureTests {
        createSourceSet = true
        modId = "msm_runtime_gametest"
        enableGameTests = true
        enableClientGameTests = false
        eula = true
    }
}

dependencies {
    // GeckoLib (ADR 0029 D6): compiled against, never bundled, never a hard dependency (fabric.mod.json "suggests").
    // Non-remapping Loom has no mod* configurations: a plain jar with a fabric.mod.json on the run classpath is
    // discovered by Fabric Loader as a mod. `localRuntime` puts it on runClient, runServer and runGameTest without
    // exposing it to consumers; -PwithoutGeckolib leaves it off to check the runtime without GeckoLib.
    val geckolib = "maven.modrinth:geckolib:${providers.gradleProperty("geckolib_modrinth_version_id").get()}"
    compileOnly(geckolib)
    "gametestCompileOnly"(geckolib)
    if (!providers.gradleProperty("withoutGeckolib").isPresent) {
        localRuntime(geckolib)
    }
}

tasks.processResources {
    val version = project.version
    val geckolibVersion = providers.gradleProperty("geckolib_version").get()
    inputs.property("version", version)
    inputs.property("geckolibVersion", geckolibVersion)
    filesMatching("fabric.mod.json") {
        expand("version" to version, "geckolib_version" to geckolibVersion)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.release = 25
    options.encoding = "UTF-8"
}

java {
    withSourcesJar()
    sourceCompatibility = JavaVersion.VERSION_25
    targetCompatibility = JavaVersion.VERSION_25
}
