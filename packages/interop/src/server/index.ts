/**
 * The local server (ADR 0133 D7 to D10): its folder layout and marker (`layout.ts`,
 * `ensureServer`, `acceptServerEula`, `planServerStart`, `listServers`), the Fabric server
 * launcher's download cache, start command and log states (`fabric-launcher.ts`), the Java
 * search (`java.ts`), `server.properties` (`properties.ts`) and the EULA (`eula.ts`). Pure over
 * an injected file system, downloader and hashers; the app's main process starts and stops the
 * server.
 */

export { ServerError, type ServerErrorCode } from './errors';
export {
  EULA_FILE,
  EULA_URL,
  type EulaAcceptance,
  type EulaState,
  eulaAccepted,
  eulaText,
  isEulaAcceptance,
  readEula,
  writeEulaAcceptance,
} from './eula';
export {
  cachedServerLauncher,
  DEFAULT_SERVER_MEMORY_MB,
  FABRIC_INSTALLER_VERSIONS_URL,
  FABRIC_META,
  latestStableInstaller,
  SERVER_LAUNCHER_CACHE,
  SERVER_LAUNCHER_FILE,
  SERVER_LAUNCHER_RECORD,
  SERVER_STOP_LINE,
  type ServerLauncherCacheDeps,
  type ServerLauncherJar,
  type ServerLauncherWanted,
  type ServerLogState,
  type ServerStartCommand,
  serverLauncherUrl,
  serverLogState,
  serverStartCommand,
  serverStateAfter,
} from './fabric-launcher';
export {
  type FindJavaDeps,
  type FindJavaResult,
  findJava,
  type JavaCandidate,
  type JavaSearchEnv,
  type JavaSource,
  javaMajor,
  parseJavaVersionOutput,
  parseReleaseFile,
} from './java';
export {
  acceptServerEula,
  type EnsuredServer,
  type EnsureServerDeps,
  type EnsureServerOptions,
  ensureServer,
  listServers,
  type ManagedServerEntry,
  parseServerMarker,
  placeServer,
  planServerStart,
  readServerMarker,
  SERVER_MARKER,
  SERVER_MARKER_FORMAT,
  SERVERS_FOLDER,
  type ServerKind,
  type ServerMarker,
  type ServerPlacement,
  type ServerStartPlan,
  serverFolderBase,
  serverMarkerText,
  serversFolder,
} from './layout';
export {
  type AppliedServerProperties,
  applyServerProperties,
  DEFAULT_SERVER_PORT,
  GAME_PROPERTY_DEFAULTS,
  MSM_SERVER_KEYS,
  type MsmServerKey,
  parseProperties,
  propertyLine,
  SERVER_PROPERTIES_FILE,
  type ServerSettings,
  serverPropertyValues,
  setProperties,
} from './properties';
