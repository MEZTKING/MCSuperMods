import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../../shared/ipc-channels';
import type { PlatformAdapter } from '../../../shared/platform';
import { Button, iconButtonClass } from './ui/Button';

/**
 * The status-toast text for the result of a manual update check (ADR 0018). `currentVersion`
 * is the running app's version, shown when it is the latest. Error messages come from main
 * already short and sanitised.
 */
export function updateCheckMessage(
  status: UpdateStatus,
  currentVersion?: string | null,
): { kind: 'info' | 'error'; text: string } {
  switch (status.state) {
    case 'idle':
    case 'checking':
      return { kind: 'info', text: 'Checking for updates…' };
    case 'not-available':
      return {
        kind: 'info',
        text:
          currentVersion === undefined || currentVersion === null || currentVersion === ''
            ? 'You have the latest version.'
            : `You have the latest version (v${currentVersion.replace(/^v/, '')}).`,
      };
    case 'available':
      return { kind: 'info', text: `Version ${status.version} is available; downloading it now.` };
    case 'downloading':
      return { kind: 'info', text: `Downloading the update (${status.percent}%).` };
    case 'downloaded':
      return {
        kind: 'info',
        text: `Version ${status.version} is ready. Choose Restart to update to install it.`,
      };
    case 'error':
      return { kind: 'error', text: status.message || 'Could not check for updates.' };
    case 'disabled':
      return {
        kind: 'info',
        text:
          status.reason === 'test-run'
            ? 'Updates are turned off in test runs.'
            : 'Automatic updates are available only in the installed Windows app.',
      };
  }
}

/** Props of {@link UpdateBanner}. */
export interface UpdateBannerProps {
  updates: Pick<PlatformAdapter['updates'], 'install' | 'onStatus'>;
}

/**
 * A slim banner for a background update: download progress, then a "Restart to update"
 * button. Dismissible; a newly downloaded update shows it again. Checks, errors and "up to
 * date" never show here (manual checks report through the status toast).
 */
export function UpdateBanner({ updates }: UpdateBannerProps) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  // The notice the user dismissed: `downloading`, or `downloaded:<version>`. A finished
  // download is news even after the progress bar was dismissed.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => updates.onStatus(setStatus), [updates]);

  if (status === null) return null;
  if (status.state !== 'downloading' && status.state !== 'downloaded') return null;
  const notice = status.state === 'downloaded' ? `downloaded:${status.version}` : 'downloading';
  if (dismissed === notice) return null;

  return (
    <section
      aria-label="Update"
      data-testid="update-banner"
      className="flex items-center gap-2 border-b border-border bg-panel px-3 py-1 text-sm"
    >
      <Download size={14} aria-hidden />
      {status.state === 'downloading' ? (
        <>
          <span>Downloading an update…</span>
          <progress
            aria-label="Update download"
            data-testid="update-progress"
            max={100}
            value={status.percent}
            className="w-40"
          />
          <span>{status.percent}%</span>
        </>
      ) : (
        <>
          <span role="status">
            {installing
              ? 'MCSuperMods will close and install the update.'
              : `Version ${status.version} is ready to install.`}
          </span>
          <Button
            data-testid="update-install"
            disabled={installing}
            onClick={() => {
              setInstalling(true);
              void updates.install().catch(() => setInstalling(false));
            }}
          >
            Restart to update
          </Button>
        </>
      )}
      <span className="flex-1" />
      <button
        type="button"
        className={iconButtonClass}
        aria-label="Dismiss update notice"
        data-testid="update-dismiss"
        onClick={() => setDismissed(notice)}
      >
        <X size={14} aria-hidden />
      </button>
    </section>
  );
}
