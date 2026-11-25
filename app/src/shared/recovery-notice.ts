/**
 * The notice the window shows after main started its page again (B870, `main/crash-recovery.ts`):
 * its data, served once over `msm:v1:app:recoveryNotice`, and its words.
 *
 * @packageDocumentation
 */

/** The problem code of a plugin turned off for this run after the page stopped twice. */
export const PLUGIN_OFF_FOR_THIS_RUN = 'plugin.off-for-this-run';

/** The most plugin names one notice carries (as many as the plugins folder may hold). */
export const RECOVERY_NOTICE_PLUGINS_MAX = 64;

/** What the reloaded page tells the user. */
export interface RecoveryNotice {
  /** The names of the third-party plugins that were started when the page stopped. */
  readonly plugins: string[];
  /** Whether third-party plugins are off for the rest of this run. */
  readonly pluginsOff: boolean;
}

/** The words of the notice, for the page's dialog and for tests. */
export function recoveryNoticeText(notice: RecoveryNotice): {
  title: string;
  lines: string[];
} {
  const lines = [
    'Something stopped the MCSuperMods window, so it started again.',
    'Changes you had not saved could not be kept. Open your mod again from Home to go on.',
  ];
  if (notice.plugins.length > 0) {
    lines.push(
      notice.plugins.length === 1
        ? `This plugin from someone else was running: ${notice.plugins[0]}. It may have caused it.`
        : `These plugins from other people were running: ${notice.plugins.join(', ')}. One of them may have caused it.`,
    );
  }
  if (notice.pluginsOff) {
    lines.push(
      'It happened twice in a short time, so plugins from other people are off until you start MCSuperMods again.',
    );
  }
  return { title: 'MCSuperMods started its window again', lines };
}
