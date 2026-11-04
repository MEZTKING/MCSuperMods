/**
 * IPC channel names, kept free of runtime dependencies so that the sandboxed preload can
 * import them without bundling zod. Every channel is versioned: `msm:v<IPC_VERSION>:...`.
 *
 * @packageDocumentation
 */

/** The IPC contract version. Bump it, and every channel prefix, on a breaking change. */
export const IPC_VERSION = 1;

/** Request/response channels, handled with `ipcMain.handle` and called with `invoke`. */
export const InvokeChannels = {
  projectPickDirectory: 'msm:v1:project:pickDirectory',
  projectOpenRoot: 'msm:v1:project:openRoot',
  projectCreateRoot: 'msm:v1:project:createRoot',
  projectCloseRoot: 'msm:v1:project:closeRoot',
  projectCurrentRoot: 'msm:v1:project:currentRoot',
  fsReadFile: 'msm:v1:fs:readFile',
  fsWriteFile: 'msm:v1:fs:writeFile',
  fsReadDir: 'msm:v1:fs:readDir',
  fsExists: 'msm:v1:fs:exists',
  fsMkdirp: 'msm:v1:fs:mkdirp',
  fsRemove: 'msm:v1:fs:remove',
  appInfo: 'msm:v1:app:info',
  dialogConfirmDiscard: 'msm:v1:dialog:confirmDiscard',
} as const;

/** One-way channels: main to renderer (`menu`) and renderer to main (the others). */
export const EventChannels = {
  /** Main to renderer: a menu command, payload {@link MenuCommand}. */
  menu: 'msm:v1:menu',
  /** Renderer to main: the renderer has rendered its first frame (used by smoke mode). */
  smokeReady: 'msm:v1:app:smokeReady',
  /** Renderer to main: whether the open project has unsaved changes, payload `boolean`. */
  setDirty: 'msm:v1:app:setDirty',
} as const;

/** The name of an invoke channel. */
export type InvokeChannel = (typeof InvokeChannels)[keyof typeof InvokeChannels];

/** Commands the application menu sends to the renderer. */
export const MENU_COMMANDS = ['new', 'open', 'save', 'undo', 'redo'] as const;

/** A command the application menu sends to the renderer. */
export type MenuCommand = (typeof MENU_COMMANDS)[number];

/** Whether a value is a known menu command. */
export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && (MENU_COMMANDS as readonly string[]).includes(value);
}
