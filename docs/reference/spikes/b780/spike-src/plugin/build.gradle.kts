plugins {
    java
}

group = "dev.mcsupermods.spike"
version = "0.0.1"

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(25))
}

repositories {
    // PaperMC's repository also proxies Maven Central (the API's own dependencies come through it).
    maven("https://repo.papermc.io/repository/maven-public/")
    mavenCentral()
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:${property("paper_api_version")}")
    testImplementation("io.papermc.paper:paper-api:${(findProperty("testApi") as String?) ?: property("paper_api_version")}")
    testImplementation("org.mockbukkit.mockbukkit:mockbukkit-v26.3:4.124.0")
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
    maxHeapSize = "768m"
    testLogging { events("passed", "failed", "skipped"); showStandardStreams = true }
}

// The jar carries the spike's own data pack (src/main/resources/msm_pack) and, with -PwithSample,
// the sample game modes' vanilla data pack unpacked under sample_pack/ (P5: a pack ships as files).
val spikeId = (findProperty("spikeId") as String?) ?: "msm_spike"
tasks.processResources {
    includeEmptyDirs = false
    inputs.property("spikeId", spikeId)
    filesMatching(listOf("paper-plugin.yml", "spike.properties")) {
        expand("spikeId" to spikeId, "version" to project.version)
    }
    filesMatching("msm_pack/**") {
        path = path.replace("/NS/", "/" + spikeId + "/")
        if (name.endsWith(".mcfunction") || name.endsWith(".json")) filter { it.replace("NS", spikeId) }
    }
    val sample = findProperty("withSample") as String?
    if (sample != null) {
        from(zipTree(sample)) { into("sample_pack") }
    }
}

tasks.jar {
    includeEmptyDirs = false
    archiveBaseName.set(spikeId)
}
