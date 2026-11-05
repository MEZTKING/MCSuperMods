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
      if (status.reason === 'no-published-release') {
        return {
          kind: 'info',
          text: 'No published release found on GitHub yet. Releases must be published (not drafts) before installed copies can update.',
        };
      }
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
  updates: Pick<PlatformAdapter['updates'], 'install' | 'onStatus' | 'current'>;
  /** Opens "What's new" for the update's version, with the feed's release notes if any. */
  onWhatsNew?(version: string, notes?: string): void;
}

/** What the banner shows: the update's version and, once known, its notes and progress. */
type Notice =
  | { phase: 'downloading'; version: string | null; percent: number | null; notes?: string }
  | { phase: 'downloaded'; version: string; notes?: string };

/**
 * The banner's notice for `status`, given the previous one (which remembers the version and
 * notes from `available` while the download runs). `null` hides the banner: checks, errors
 * and "up to date" never show here (manual checks report through the status toast).
 */
export function bannerNotice(status: UpdateStatus, previous: Notice | null): Notice | null {
  switch (status.state) {
    case 'available':
      return {
        phase: 'downloading',
        version: status.version,
        percent: null,
        ...(status.notes === undefined ? {} : { notes: status.notes }),
      };
    case 'downloading': {
      const version =
        status.version ?? (previous?.phase === 'downloading' ? previous.version : null);
      const notes = previous?.phase === 'downloading' ? previous.notes : undefined;
      return {
        phase: 'downloading',
        version,
        percent: status.percent,
        ...(notes === undefined ? {} : { notes }),
      };
    }
    case 'downloaded': {
      const notes = status.notes ?? previous?.notes;
      return {
        phase: 'downloaded',
        version: status.version,
        ...(notes === undefined ? {} : { notes }),
      };
    }
    default:
      return null;
  }
}

/**
 * A slim banner for a background update (ADR 0018, B145): "Version X is available,
 * downloading…" from the moment the update is found (with progress once it arrives), then
 * "Version X is ready" with "Restart to update". Both offer "What's new". Dismissible; a
 * newly downloaded update shows it again. On mount it asks main for the current status, so a
 * reload or a late subscription does not miss an update.
 */
export function UpdateBanner({ updates, onWhatsNew }: UpdateBannerProps) {
  const [notice, setNotice] = useState<Notice | null>(null);
  // The notice the user dismissed: `downloading`, or `downloaded:<version>`. A finished
  // download is news even after the progress notice was dismissed.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let live = true;
    let pushed = false;
    const apply = (status: UpdateStatus): void => {
      setNotice((previous) => bannerNotice(status, previous));
    };
    const unsubscribe = updates.onStatus((status) => {
      pushed = true;
      apply(status);
    });
    updates.current().then(
      (status) => {
        // A pushed status is newer than the answer to this request.
        if (live && !pushed) apply(status);
      },
      () => {
        // Older main processes or IPC failures: wait for the next pushed status.
      },
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, [updates]);

  if (notice === null) return null;
  const key = notice.phase === 'downloaded' ? `downloaded:${notice.version}` : 'downloading';
  if (dismissed === key) return null;
  const whatsNew =
    onWhatsNew === undefined || notice.version === null ? null : (
      <Button
        data-testid="update-whats-new"
        onClick={() => {
          if (notice.version !== null) onWhatsNew(notice.version, notice.notes);
        }}
      >
        What's new
      </Button>
    );

  return (
    <section
      aria-label="Update"
      data-testid="update-banner"
      className="flex items-center gap-2 border-b border-border bg-panel px-3 py-1 text-sm"
    >
      <Download size={14} aria-hidden />
      {notice.phase === 'downloading' ? (
        <>
          <span role="status" data-testid="update-banner-text">
            {notice.version === null
              ? 'Downloading an update…'
              : `Version ${notice.version} is available, downloading…`}
          </span>
          {notice.percent !== null && (
            <>
              <progress
                aria-label="Update download"
                data-testid="update-progress"
                max={100}
                value={notice.percent}
                className="w-40"
              />
              <span>{notice.percent}%</span>
            </>
          )}
          {whatsNew}
        </>
      ) : (
        <>
          <span role="status" data-testid="update-banner-text">
            {installing
              ? 'MCSuperMods will close and install the update.'
              : `Version ${notice.version} is ready \u2014`}
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
          {whatsNew}
        </>
      )}
      <span className="flex-1" />
      <button
        type="button"
        className={iconButtonClass}
        aria-label="Dismiss update notice"
        data-testid="update-dismiss"
        onClick={() => setDismissed(key)}
      >
        <X size={14} aria-hidden />
      </button>
    </section>
  );
}
