/**
 * The Minecraft EULA in a server folder (ADR 0133 D8; B760 N10). The server does not start
 * until `eula.txt` holds `eula=true`. MSM writes that line only when the caller passes the
 * user's own acceptance (their tick on the card, for this server folder); nothing here ticks it
 * for them. The acceptance is also recorded in the server's marker (`layout.ts`
 * `acceptServerEula`), so a removed `eula.txt` can be written again for the same folder.
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { ServerError } from './errors';
import { parseProperties } from './properties';

/** The EULA's address, as the server writes it into `eula.txt`. */
export const EULA_URL = 'https://aka.ms/MinecraftEULA';

/** The file the server reads. */
export const EULA_FILE = 'eula.txt';

/**
 * `accepted`: `eula=true`; `not-accepted`: the file says anything else (the server writes
 * `eula=false` at its first start); `missing`: no file yet.
 */
export type EulaState = 'accepted' | 'not-accepted' | 'missing';

/**
 * The user's acceptance of the EULA for one server folder: `accepted` must be the literal
 * `true`, and `at` the time of their tick (an ISO 8601 date and time).
 */
export interface EulaAcceptance {
  accepted: true;
  at: string;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Whether `value` is a real acceptance (checked at run time too: it may come over IPC). */
export function isEulaAcceptance(value: unknown): value is EulaAcceptance {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as { accepted?: unknown; at?: unknown };
  return raw.accepted === true && typeof raw.at === 'string' && ISO_TIME.test(raw.at);
}

/** Whether `eula.txt`'s text accepts the EULA, as the server reads it (`true`, any case). */
export function eulaAccepted(text: string): boolean {
  return (parseProperties(text).get('eula') ?? 'false').trim().toLowerCase() === 'true';
}

/** The text MSM writes: two comment lines and `eula=true`. */
export function eulaText(acceptance: EulaAcceptance): string {
  return [
    `#By changing the setting below to TRUE you are indicating your agreement to our EULA (${EULA_URL}).`,
    `#Accepted by the user in MCSuperMods on ${acceptance.at}`,
    'eula=true',
    '',
  ].join('\n');
}

/** The EULA's state in a server folder. */
export async function readEula(fs: InstallFileSystem, serverDir: string): Promise<EulaState> {
  const path = joinInstallPath(serverDir, EULA_FILE);
  if (!(await fs.exists(path))) return 'missing';
  try {
    return eulaAccepted(new TextDecoder().decode(await fs.readFile(path)))
      ? 'accepted'
      : 'not-accepted';
  } catch {
    return 'not-accepted';
  }
}

/**
 * Writes `eula=true` into the server folder, only with the user's `acceptance`; anything else
 * is `server.eula-not-accepted` and nothing is written. Prefer `acceptServerEula`, which also
 * checks the folder is MSM's and records the acceptance.
 */
export async function writeEulaAcceptance(
  fs: InstallFileSystem,
  serverDir: string,
  acceptance: EulaAcceptance,
): Promise<void> {
  if (!isEulaAcceptance(acceptance)) {
    throw new ServerError(
      'server.eula-not-accepted',
      'The server cannot be started until you accept the Minecraft EULA.',
    );
  }
  await fs.writeFile(
    joinInstallPath(serverDir, EULA_FILE),
    new TextEncoder().encode(eulaText(acceptance)),
  );
}
