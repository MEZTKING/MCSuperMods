/**
 * The version-independent text files of an ejected Java project (ADR 0033 D2): Gradle build
 * files, `.gitignore`, the wrapper properties, `README.md` and `LICENSE-NOTES.md`. Every
 * version comes from the target's facts; nothing here names a Minecraft class.
 *
 * @packageDocumentation
 */

import type { FabricFacts, GeckolibFacts } from '@msm/plugin-api';

/** What the text files need to know about the project. */
export interface ProjectFacts {
  modId: string;
  modName: string;
  modVersion: string;
  javaPackage: string;
  modClassName: string;
  mcVersion: string;
  java: number;
  fabric: FabricFacts;
  /** GeckoLib facts when the project has entities. */
  geckolib: GeckolibFacts | undefined;
  msmVersion: string;
  /** Ids of the scripts left out of the eject. */
  scripts: readonly string[];
  /** Whether the host supplied the Gradle wrapper. */
  wrapper: boolean;
}

/** The Maven coordinates of GeckoLib on the Modrinth Maven. */
export function geckolibCoordinates(geckolib: GeckolibFacts): string {
  return `maven.modrinth:geckolib:${geckolib.modrinthVersionId ?? geckolib.version}`;
}

export function settingsGradle(facts: ProjectFacts): string {
  return `pluginManagement {
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

rootProject.name = "${facts.modId}"
`;
}

export function buildGradle(facts: ProjectFacts): string {
  const repositories =
    facts.geckolib === undefined
      ? ''
      : `
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
`;
  const geckolib =
    facts.geckolib === undefined
      ? ''
      : `
    // GeckoLib, nested in the built jar (jar-in-jar). Loom prints "(<id>) is not valid semver"
    // for the Modrinth version id; that line is harmless.
    val geckolib = "maven.modrinth:geckolib:\${providers.gradleProperty("geckolib_modrinth_version_id").get()}"
    implementation(geckolib)
    include(geckolib)`;
  return `plugins {
    id("net.fabricmc.fabric-loom")
}

version = providers.gradleProperty("mod_version").get()
group = providers.gradleProperty("maven_group").get()

base {
    archivesName = providers.gradleProperty("archives_base_name").get()
}
${repositories}
dependencies {
    minecraft("com.mojang:minecraft:\${providers.gradleProperty("minecraft_version").get()}")
    implementation("net.fabricmc:fabric-loader:\${providers.gradleProperty("loader_version").get()}")
    implementation("net.fabricmc.fabric-api:fabric-api:\${providers.gradleProperty("fabric_api_version").get()}")${geckolib}
}

tasks.processResources {
    val version = project.version
    inputs.property("version", version)
    filesMatching("fabric.mod.json") {
        expand("version" to version)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.release = ${facts.java}
    options.encoding = "UTF-8"
}

java {
    sourceCompatibility = JavaVersion.VERSION_${facts.java}
    targetCompatibility = JavaVersion.VERSION_${facts.java}
}
`;
}

export function gradleProperties(facts: ProjectFacts): string {
  const lines = [
    'org.gradle.jvmargs=-Xmx2G',
    'org.gradle.parallel=true',
    'org.gradle.configuration-cache=true',
    '',
    `minecraft_version=${facts.mcVersion}`,
    `loader_version=${facts.fabric.loader}`,
    `loom_version=${facts.fabric.loom}`,
    `fabric_api_version=${facts.fabric.api}`,
  ];
  if (facts.geckolib !== undefined) {
    lines.push(
      `geckolib_modrinth_version_id=${facts.geckolib.modrinthVersionId ?? facts.geckolib.version}`,
    );
  }
  lines.push(
    '',
    `mod_version=${propertyValue(facts.modVersion)}`,
    `maven_group=${facts.javaPackage}`,
    `archives_base_name=${facts.modId}`,
  );
  return `${lines.join('\n')}\n`;
}

/** Escapes a value for a Java properties file (backslashes, line breaks, non-ASCII). */
function propertyValue(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (char === '\\') out += '\\\\';
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (code < 0x20 || code > 0x7e) {
      out +=
        code > 0xffff
          ? char
              .split('')
              .map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`)
              .join('')
          : `\\u${code.toString(16).padStart(4, '0')}`;
    } else out += char;
  }
  return out;
}

export function gitignore(): string {
  return ['.gradle/', 'build/', 'out/', 'run/', '.idea/', '*.iml', '.vscode/', ''].join('\n');
}

export function wrapperProperties(facts: ProjectFacts): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${facts.fabric.gradle}-bin.zip
networkTimeout=10000
retries=0
retryBackOffMs=500
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

export function readme(facts: ProjectFacts): string {
  const packagePath = facts.javaPackage.replaceAll('.', '/');
  const sections: string[] = [
    `# ${facts.modName}`,
    '',
    `A Fabric mod for Minecraft ${facts.mcVersion}, generated by MCSuperMods ${facts.msmVersion} ("Export Java project"). This project is not managed by MCSuperMods: it is yours to edit, and edits do not flow back into the MCSuperMods project. Exporting again writes a new project; it does not update this one.`,
    '',
    'The generated Java does what the MCSuperMods runtime (`msm_runtime`) does with the same definitions, without depending on it.',
    '',
    '## Build',
    '',
    `You need JDK ${facts.java}. Then run:`,
    '',
    '```',
    './gradlew build',
    '```',
    '',
    `(on Windows, \`gradlew.bat build\`). The mod jar is \`build/libs/${facts.modId}-${facts.modVersion}.jar\`; put it in the \`mods\` folder of a Fabric ${facts.mcVersion} installation with Fabric API.`,
  ];
  if (!facts.wrapper) {
    sections.push(
      '',
      `The Gradle wrapper was not included. With Gradle installed, run \`gradle wrapper --gradle-version ${facts.fabric.gradle}\` once in this folder to create it.`,
    );
  }
  if (facts.geckolib !== undefined) {
    sections.push(
      '',
      `GeckoLib ${facts.geckolib.version} is downloaded from the Modrinth Maven and nested in the jar. During the build, Loom prints a line ending in "is not valid semver for dependency ${geckolibCoordinates(facts.geckolib)}"; it is harmless (GeckoLib's own version comes from its \`fabric.mod.json\`).`,
    );
  }
  sections.push(
    '',
    '## Structure',
    '',
    '| Path | Contents |',
    '|---|---|',
    `| \`src/main/java/${packagePath}/${facts.modClassName}.java\` | The mod initialiser: registers the blocks, items and entities |`,
    `| \`src/main/java/${packagePath}/ModBlocks.java\`, \`ModItems.java\`, \`ModEntities.java\` | Registration, one constant per block, item and entity type |`,
    `| \`src/main/java/${packagePath}/block/\`, \`item/\`, \`entity/\` | Classes for content with behaviour (events, redstone, AI goals, animations) |`,
    `| \`src/main/java/${packagePath}/Actions.java\` | The event actions (functions, particles, block states, items, sounds) |`,
    `| \`src/main/java/${packagePath}/client/\` | The client entrypoint and GeckoLib models (projects with entities) |`,
    '| `src/main/resources/fabric.mod.json` | Mod metadata |',
    '| `src/main/resources/assets/`, `data/` | Models, textures, language files, loot tables, functions and other pack files |',
    '| `msm.export.json` | Which MCSuperMods version and target produced this project |',
    '',
    'Files that did not exist for this project (for example `ModEntities.java` without entities) are not written.',
  );
  if (facts.scripts.length > 0) {
    sections.push(
      '',
      '## Scripts',
      '',
      `Scripts are not ejected: the project's ${facts.scripts.length} script(s) and every \`run_script\` action were left out, so their behaviour is missing from this mod. Port them to Java by hand if you need them:`,
      '',
      ...facts.scripts.map((id) => `- \`${id}\``),
    );
  }
  sections.push(
    '',
    '## Licences',
    '',
    'See `LICENSE-NOTES.md` for the licences of the libraries this project uses. Your own code and assets are under the licence you choose (the `license` field of `fabric.mod.json`).',
    '',
  );
  return sections.join('\n');
}

export function licenceNotes(facts: ProjectFacts): string {
  const lines = [
    '# Licence notes',
    '',
    'This project was generated by MCSuperMods (MIT licence). The generated sources carry no licence of their own; choose one for your mod.',
    '',
    'Libraries and tools the project uses:',
    '',
    `- Fabric Loader ${facts.fabric.loader} and Fabric API ${facts.fabric.api}: Apache License 2.0 (https://github.com/FabricMC/fabric).`,
    `- Fabric Loom ${facts.fabric.loom} (Gradle plugin, build only): MIT licence (https://github.com/FabricMC/fabric-loom).`,
    `- The Gradle wrapper (\`gradlew\`, \`gradlew.bat\`, \`gradle/wrapper/\`), Gradle ${facts.fabric.gradle}: Apache License 2.0 (https://gradle.org).`,
  ];
  if (facts.geckolib !== undefined) {
    lines.push(
      `- GeckoLib ${facts.geckolib.version}: MIT licence (https://github.com/bernie-g/geckolib). Nested in the built jar.`,
    );
  }
  lines.push(
    `- Minecraft ${facts.mcVersion}: Mojang's game code is downloaded by Loom at build time under the Minecraft EULA and is not part of this project or of the built jar.`,
    '',
  );
  return lines.join('\n');
}
