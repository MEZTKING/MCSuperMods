/**
 * The Modpacks dialog (ADR 0046 D2): the remembered modpacks on the left; the selected one's
 * details, member projects and extra mods on the right, with Export modpack (.mrpack)… and
 * Test modpack in Minecraft. The host supplies the platform services and the session (for
 * scratch builds) and opens member projects.
 *
 * @packageDocumentation
 */

import type { Modpack } from '@msm/core';
import type { Problem, TargetFacts } from '@msm/plugin-api';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useId, useState } from 'react';
import type { ModpackListEntry, ModpackView, PlatformAdapter } from '../../../shared/platform';
import { buildModpackJars, modpackMrpack } from '../modpacks/build';
import type { ProjectSession } from '../session/project-session';
import { fieldClass } from './NewElementDialog';
import { Button } from './ui/Button';
import { targetLabel } from './wizard/wizard-model';

export interface ModpacksDialogProps {
  session: ProjectSession;
  modpacks: NonNullable<PlatformAdapter['modpacks']>;
  testInMinecraft: PlatformAdapter['testInMinecraft'];
  saveFile: PlatformAdapter['dialogs']['saveFile'];
  /** The Minecraft versions offered (the session's available targets). */
  targets: readonly TargetFacts[];
  /** The open project's folder, offered by "Add open project". */
  currentProjectRoot: string | null;
  /** The target a new modpack starts with. */
  defaultTargetId: string;
  /** Opens a member project in the window (closing this dialog). */
  onOpenProject(root: string): void;
  onClose(): void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ModpacksDialog(props: ModpacksDialogProps) {
  const { modpacks } = props;
  const [list, setList] = useState<ModpackListEntry[]>([]);
  const [view, setView] = useState<ModpackView | null>(null);
  const [draft, setDraft] = useState<Pick<Modpack, 'name' | 'version' | 'summary'> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [modInput, setModInput] = useState('');
  const ids = { name: useId(), version: useId(), summary: useId(), target: useId(), mod: useId() };

  const refreshList = useCallback(async () => {
    setList(await modpacks.list());
  }, [modpacks]);

  useEffect(() => {
    void refreshList().catch((error: unknown) =>
      setMessage({ kind: 'error', text: messageOf(error) }),
    );
  }, [refreshList]);

  const show = (next: ModpackView | null): void => {
    setView(next);
    setDraft(
      next === null
        ? null
        : {
            name: next.modpack.name,
            version: next.modpack.version,
            ...(next.modpack.summary === undefined ? {} : { summary: next.modpack.summary }),
          },
    );
    setProblems([]);
  };

  /** Runs `action` with a busy label and reports its error. */
  const run = async (label: string, action: () => Promise<void>): Promise<void> => {
    setBusy(label);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ kind: 'error', text: messageOf(error) });
    } finally {
      setBusy(null);
    }
  };

  const select = (root: string): Promise<void> =>
    run('Opening…', async () => show(await modpacks.read(root)));

  const save = (next: Modpack): Promise<void> =>
    run('Saving…', async () => {
      if (view === null) return;
      show(await modpacks.write(view.root, next));
      await refreshList();
    });

  const saveDetails = (): void => {
    if (view === null || draft === null) return;
    const summary = draft.summary?.trim() ?? '';
    const { summary: _old, ...rest } = view.modpack;
    const next: Modpack = {
      ...rest,
      name: draft.name.trim() === '' ? view.modpack.name : draft.name.trim(),
      version: draft.version.trim() === '' ? view.modpack.version : draft.version.trim(),
      ...(summary === '' ? {} : { summary }),
    };
    if (JSON.stringify(next) !== JSON.stringify(view.modpack)) void save(next);
  };

  const build = async (current: ModpackView) => {
    const result = await buildModpackJars(
      props.session,
      modpacks,
      current,
      (member, index, total) => setBusy(`Building ${member} (${index + 1} of ${total})…`),
    );
    setProblems(result.problems);
    return result;
  };

  const targetOf = (current: ModpackView): TargetFacts | undefined =>
    props.targets.find((target) => target.id === current.modpack.targetId);

  const exportMrpack = (): Promise<void> =>
    run('Building…', async () => {
      if (view === null) return;
      const target = targetOf(view);
      if (target === undefined)
        throw new Error(`Unknown Minecraft version ${view.modpack.targetId}.`);
      const built = await build(view);
      if (!built.ok) {
        setMessage({ kind: 'error', text: 'Nothing was exported: fix the problems below first.' });
        return;
      }
      const { fileName, data } = modpackMrpack(view.modpack, target, built.jars);
      const location = await props.saveFile({
        title: 'Export modpack',
        defaultName: fileName,
        filters: [{ name: 'Modrinth modpack', extensions: ['mrpack'] }],
        data,
      });
      if (location !== null) {
        setMessage({ kind: 'info', text: `Exported ${built.jars.length} mod(s) to ${location}.` });
      }
    });

  const testModpack = (): Promise<void> =>
    run('Building…', async () => {
      if (view === null) return;
      const built = await build(view);
      if (!built.ok) {
        setMessage({ kind: 'error', text: 'Nothing was installed: fix the problems below first.' });
        return;
      }
      setBusy('Installing…');
      const result = await props.testInMinecraft.runModpack(
        view.modpack.targetId,
        built.jars.map((jar) => ({ modId: jar.modId, data: jar.data })),
        view.modpack.mods,
      );
      const removed =
        result.removed.length === 0
          ? ''
          : ` Removed ${result.removed.length} jar(s) from earlier tests.`;
      setMessage({
        kind: 'info',
        text: `Installed ${result.installed.length} mod(s) and Fabric API into ${result.modsDir}.${removed} ${
          result.launched ? 'The launcher is starting.' : (result.note ?? '')
        }`.trim(),
      });
    });

  /**
   * Switches the Minecraft version; pinned mods are files for the old version, so the
   * message points at Update mods (ADR 0046 D6).
   */
  const changeTarget = (targetId: string): Promise<void> =>
    run('Saving…', async () => {
      if (view === null) return;
      show(await modpacks.write(view.root, { ...view.modpack, targetId }));
      await refreshList();
      if (view.modpack.mods.length > 0) {
        setMessage({
          kind: 'info',
          text: 'The Minecraft version changed: choose Update mods to get the matching version of each Modrinth mod.',
        });
      }
    });

  /** Looks every pinned mod up again for the modpack's Minecraft version. */
  const updateMods = (): Promise<void> =>
    run('Updating mods…', async () => {
      if (view === null) return;
      const gameVersion = targetOf(view)?.mcVersion ?? view.modpack.targetId;
      const mods = [];
      const missing: string[] = [];
      let changed = 0;
      for (const [index, mod] of view.modpack.mods.entries()) {
        setBusy(`Updating ${mod.title} (${index + 1} of ${view.modpack.mods.length})…`);
        try {
          const lookup = await modpacks.lookupMod(mod.projectId, gameVersion);
          if (lookup.file.versionId !== mod.versionId) changed += 1;
          mods.push(lookup.file);
        } catch {
          // Kept as it is: the user decides whether to remove it.
          missing.push(mod.title);
          mods.push(mod);
        }
      }
      show(await modpacks.write(view.root, { ...view.modpack, mods }));
      setMessage({
        kind: missing.length === 0 ? 'info' : 'error',
        text:
          `${changed} mod(s) updated.` +
          (missing.length === 0
            ? ''
            : ` No version for this Minecraft version was found for: ${missing.join(', ')}. Remove them or try again later.`),
      });
    });

  const addMod = (): Promise<void> =>
    run('Looking up on Modrinth…', async () => {
      if (view === null) return;
      const target = targetOf(view);
      const lookup = await modpacks.lookupMod(modInput, target?.mcVersion ?? view.modpack.targetId);
      if (view.modpack.mods.some((mod) => mod.projectId === lookup.file.projectId)) {
        throw new Error(`${lookup.file.title} is already in the modpack.`);
      }
      show(
        await modpacks.write(view.root, {
          ...view.modpack,
          mods: [...view.modpack.mods, lookup.file],
        }),
      );
      setModInput('');
      // Fabric API is always in the pack; its project id is part of its CDN address.
      const fabricApiProject = target?.fabric?.apiModrinth?.url.split('/')[4];
      const missing = lookup.requiredProjects.filter(
        (id) => id !== fabricApiProject && !view.modpack.mods.some((mod) => mod.projectId === id),
      );
      setMessage({
        kind: 'info',
        text:
          `Added ${lookup.file.title} ${lookup.versionNumber}.` +
          (missing.length === 0
            ? ''
            : ` It also needs these Modrinth projects: ${missing.join(', ')}. Add them too.`),
      });
    });

  const labelOf = (entry: ModpackListEntry): string => entry.name ?? `${entry.root} (not found)`;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="modpacks-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(94vw,900px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">Modpacks</Dialog.Title>
          <p className="text-muted text-sm">
            A modpack groups your projects. Each project stays in its own folder; export the modpack
            as a Modrinth .mrpack or test all its mods together in Minecraft.
          </p>
          <div className="flex min-h-0 flex-col gap-3 sm:flex-row">
            <div className="flex flex-col gap-2 sm:w-56 sm:shrink-0">
              <ul className="flex flex-col gap-1" data-testid="modpack-list">
                {list.length === 0 && <li className="text-muted text-sm">No modpacks yet.</li>}
                {list.map((entry) => (
                  <li key={entry.root}>
                    <button
                      type="button"
                      data-testid="modpack-entry"
                      aria-current={view?.root === entry.root ? 'true' : undefined}
                      disabled={!entry.found || busy !== null}
                      className="w-full cursor-pointer rounded px-2 py-1 text-left text-sm hover:bg-bg aria-[current=true]:bg-bg aria-[current=true]:text-accent disabled:cursor-default disabled:text-muted"
                      onClick={() => void select(entry.root)}
                    >
                      {labelOf(entry)}
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                data-testid="modpack-new"
                disabled={busy !== null}
                onClick={() =>
                  void run('Creating…', async () => {
                    const created = await modpacks.create('My modpack', props.defaultTargetId);
                    if (created === null) return;
                    await refreshList();
                    show(created);
                  })
                }
              >
                New modpack…
              </Button>
              <Button
                data-testid="modpack-add-existing"
                disabled={busy !== null}
                onClick={() =>
                  void run('Opening…', async () => {
                    const added = await modpacks.addExisting();
                    if (added === null) return;
                    await refreshList();
                    show(added);
                  })
                }
              >
                Add existing modpack…
              </Button>
              {view !== null && (
                <Button
                  data-testid="modpack-forget"
                  disabled={busy !== null}
                  onClick={() =>
                    void run('Forgetting…', async () => {
                      await modpacks.forget(view.root);
                      show(null);
                      await refreshList();
                    })
                  }
                >
                  Forget this modpack
                </Button>
              )}
            </div>

            {view !== null && draft !== null && (
              <div className="flex min-w-0 flex-1 flex-col gap-3" data-testid="modpack-details">
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-sm">
                  <label htmlFor={ids.name}>Name</label>
                  <input
                    id={ids.name}
                    className={fieldClass}
                    data-testid="modpack-name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    onBlur={saveDetails}
                  />
                  <label htmlFor={ids.version}>Version</label>
                  <input
                    id={ids.version}
                    className={fieldClass}
                    value={draft.version}
                    onChange={(event) => setDraft({ ...draft, version: event.target.value })}
                    onBlur={saveDetails}
                  />
                  <label htmlFor={ids.summary}>Summary</label>
                  <input
                    id={ids.summary}
                    className={fieldClass}
                    value={draft.summary ?? ''}
                    onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                    onBlur={saveDetails}
                  />
                  <label htmlFor={ids.target}>Minecraft version</label>
                  <select
                    id={ids.target}
                    className={fieldClass}
                    value={view.modpack.targetId}
                    disabled={busy !== null}
                    onChange={(event) => void changeTarget(event.target.value)}
                  >
                    {props.targets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {targetLabel(target)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-muted text-xs">Folder: {view.root}</p>

                <section className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">Projects</h3>
                  <ul className="flex flex-col gap-1" data-testid="modpack-members">
                    {view.members.length === 0 && (
                      <li className="text-muted text-sm">
                        No projects yet. Each project becomes one mod.
                      </li>
                    )}
                    {view.members.map((member) => (
                      <li
                        key={member.path}
                        data-testid="modpack-member"
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span className="font-medium">{member.name ?? member.path}</span>
                        <span className="text-muted text-xs">{member.path}</span>
                        {!member.found && <span className="text-xs text-red-500">not found</span>}
                        {member.found && member.targetId !== view.modpack.targetId && (
                          <span className="text-xs text-red-500">
                            made for {member.targetId ?? 'another version'}
                          </span>
                        )}
                        <span className="flex-1" />
                        <Button
                          disabled={!member.found || busy !== null}
                          onClick={() => props.onOpenProject(member.root)}
                        >
                          Open
                        </Button>
                        <Button
                          disabled={busy !== null}
                          onClick={() =>
                            void save({
                              ...view.modpack,
                              projects: view.modpack.projects.filter(
                                (entry) => entry.path !== member.path,
                              ),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {props.currentProjectRoot !== null && (
                      <Button
                        data-testid="modpack-add-open-project"
                        disabled={busy !== null}
                        onClick={() =>
                          void run('Adding…', async () => {
                            const next = await modpacks.addProject(
                              view.root,
                              props.currentProjectRoot,
                            );
                            if (next !== null) show(next);
                          })
                        }
                      >
                        Add open project
                      </Button>
                    )}
                    <Button
                      data-testid="modpack-add-project"
                      disabled={busy !== null}
                      onClick={() =>
                        void run('Adding…', async () => {
                          const next = await modpacks.addProject(view.root, null);
                          if (next !== null) show(next);
                        })
                      }
                    >
                      Add project folder…
                    </Button>
                  </div>
                </section>

                <section className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">Mods from Modrinth</h3>
                  <ul className="flex flex-col gap-1" data-testid="modpack-mods">
                    {view.modpack.mods.length === 0 && (
                      <li className="text-muted text-sm">None. Fabric API is always included.</li>
                    )}
                    {view.modpack.mods.map((mod) => (
                      <li key={mod.projectId} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{mod.title}</span>
                        <span className="text-muted text-xs">{mod.fileName}</span>
                        <span className="flex-1" />
                        <Button
                          disabled={busy !== null}
                          onClick={() =>
                            void save({
                              ...view.modpack,
                              mods: view.modpack.mods.filter(
                                (entry) => entry.projectId !== mod.projectId,
                              ),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={ids.mod} className="text-sm">
                      Modrinth project name or link
                    </label>
                    <input
                      id={ids.mod}
                      className={`${fieldClass} min-w-0 flex-1`}
                      data-testid="modpack-mod-input"
                      placeholder="sodium"
                      value={modInput}
                      onChange={(event) => setModInput(event.target.value)}
                    />
                    <Button
                      data-testid="modpack-add-mod"
                      disabled={busy !== null || modInput.trim() === ''}
                      onClick={() => void addMod()}
                    >
                      Add mod
                    </Button>
                    {view.modpack.mods.length > 0 && (
                      <Button
                        data-testid="modpack-update-mods"
                        disabled={busy !== null}
                        onClick={() => void updateMods()}
                      >
                        Update mods
                      </Button>
                    )}
                  </div>
                </section>

                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="modpack-export"
                    disabled={busy !== null}
                    onClick={() => void exportMrpack()}
                  >
                    Export modpack (.mrpack)…
                  </Button>
                  <Button
                    data-testid="modpack-test"
                    disabled={busy !== null}
                    onClick={() => void testModpack()}
                  >
                    Test modpack in Minecraft
                  </Button>
                </div>
              </div>
            )}
          </div>

          {busy !== null && (
            <p className="text-muted text-sm" role="status">
              {busy}
            </p>
          )}
          {message !== null && (
            <p
              className={message.kind === 'error' ? 'text-sm text-red-500' : 'text-sm'}
              role={message.kind === 'error' ? 'alert' : 'status'}
              data-testid="modpack-message"
            >
              {message.text}
            </p>
          )}
          {problems.length > 0 && (
            <ul
              className="flex list-disc flex-col gap-1 pl-5 text-sm"
              data-testid="modpack-problems"
            >
              {problems.map((problem, index) => (
                <li key={index}>{problem.message}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Dialog.Close asChild>
              <Button data-testid="modpacks-close">Close</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
