/**
 * The local server's error (ADR 0133 D7 to D9): a stable code and a message written for the
 * user, as `InstanceError` is for instances.
 */

/** Why a local server step failed. */
export type ServerErrorCode =
  /** The recipe is not a server recipe, or names something a server cannot use. */
  | 'server.bad-recipe'
  /** A loader other than Fabric (Paper is Plan C's B789). */
  | 'server.loader-not-supported'
  /** The servers folder is not an absolute path. */
  | 'server.no-folder'
  /** Every name from the base to `-99` is taken by folders that are not this server. */
  | 'server.no-free-name'
  /** A folder or file leads outside the servers folder or the server folder. */
  | 'server.outside-root'
  /** A file MSM did not write is in the way (a mod, the launcher jar). */
  | 'server.foreign-file'
  /** A world folder MSM did not copy is in the way. */
  | 'server.foreign-world'
  /** The folder holds no readable server marker of MSM's. */
  | 'server.not-ours'
  /** The Fabric server launcher's bytes differ from the ones recorded at the first download. */
  | 'server.launcher-changed'
  /** The Fabric server launcher could not be downloaded, or what came was not a jar. */
  | 'server.download-failed'
  /** `eula.txt` was to be written without the user's acceptance. */
  | 'server.eula-not-accepted'
  /** The server cannot start because the EULA is not accepted in its folder. */
  | 'server.eula-needed'
  /** No Java program was found. */
  | 'server.no-java'
  /** Java programs were found, but none is new enough. */
  | 'server.java-too-old'
  /** The file system cannot move a folder into place in one step. */
  | 'server.cannot-stage';

/** An error with a stable code; its message is written for the user. */
export class ServerError extends Error {
  readonly code: ServerErrorCode;

  constructor(code: ServerErrorCode, message: string) {
    super(message);
    this.name = 'ServerError';
    this.code = code;
  }
}
