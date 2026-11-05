import java.util.Properties

plugins {
    id("net.fabricmc.fabric-loom") // version from settings.gradle.kts (loom_version)
}

// `-Pmc=<version>` reads the Minecraft, Fabric and GeckoLib facts from versions/<version>.properties
// (ADR 0038 D1, B151 spike; B159 finishes the layout). Without it gradle.properties holds them as before.
val mc: String? = providers.gradleProperty("mc").orNull
val versionFacts: Properties? =
    mc?.let { selected ->
        val file = layout.projectDirectory.file("versions/$selected.properties").asFile
        require(file.isFile) { "No engine-mod/versions/$selected.properties for -Pmc=$selected" }
        Properties().also { properties -> file.inputStream().use { properties.load(it) } }
    }

fun fact(name: String): String =
    if (versionFacts == null) {
        providers.gradleProperty(name).get()
    } else {
        versionFacts.getProperty(name) ?: error("versions/$mc.properties has no $name")
    }

// The jar carries the Minecraft version as build metadata only when -Pmc is given (ADR 0038 D3).
version = providers.gradleProperty("mod_version").get() + (mc?.let { "+mc$it" } ?: "")
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
    minecraft("com.mojang:minecraft:${fact("minecraft_version")}")
    implementation("net.fabricmc:fabric-loader:${fact("loader_version")}")
    implementation("net.fabricmc.fabric-api:fabric-api:${fact("fabric_api_version")}")

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
// The script API v1 description (ADR 0032 D1) lives with the scripting plugin; the contract test reads it in place.
val scriptApi = layout.projectDirectory.file("../packages/plugins/scripting/api/script-api-v1.json")

tasks.test {
    useJUnitPlatform()
    inputs.dir(conformanceCorpus).withPropertyName("conformanceCorpus")
    systemProperty("msm.conformance.definition", conformanceCorpus.asFile.absolutePath)
    inputs.file(scriptApi).withPropertyName("scriptApi")
    systemProperty("msm.script.api", scriptApi.asFile.absolutePath)
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
    // A version without a GeckoLib build (blank id, such as 26.4) compiles the bridge against the 26.3 jar
    // from gradle.properties and never puts GeckoLib on the run classpath (ADR 0038 D3).
    val geckolibId = fact("geckolib_modrinth_version_id")
    val geckolib = "maven.modrinth:geckolib:${geckolibId.ifBlank { providers.gradleProperty("geckolib_modrinth_version_id").get() }}"
    compileOnly(geckolib)
    "gametestCompileOnly"(geckolib)
    if (geckolibId.isNotBlank() && !providers.gradleProperty("withoutGeckolib").isPresent) {
        localRuntime(geckolib)
    }
}

tasks.processResources {
    val version = project.version
    val geckolibVersion = fact("geckolib_version").ifBlank { providers.gradleProperty("geckolib_version").get() }
    val minecraftDependency = fact("minecraft_dependency")
    inputs.property("version", version)
    inputs.property("geckolibVersion", geckolibVersion)
    inputs.property("minecraftDependency", minecraftDependency)
    filesMatching("fabric.mod.json") {
        expand(
            "version" to version,
            "geckolib_version" to geckolibVersion,
            "minecraft_dependency" to minecraftDependency,
        )
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
