/**
 * The Creator (ADR 0043 D3, D4): a full-size dialog with a flow picker (the library's starters
 * that carry `creator`, in groups), then the flow's fields on the left, rendered by the
 * wizard's `ParameterField` on one page in their groups, and the live preview on the right. The
 * bundle is rebuilt 150 ms after the last change (the latest values win when a build is slow)
 * and previewed from memory; "Create" turns it into change items stamped with `meta.creator`
 * and applies them as one undo step ("Create <flow>"). Opened through "Edit in Creator" the
 * dialog starts on that set's flow with its stored values, plans the update by the kept-edits
 * rule and applies it as "Update <flow>".
 *
 * Test ids: `creator-dialog`, `creator-group-<group>`, `creator-flow-<id>`, `param-<id>`,
 * `creator-namespace`, `creator-tab-<tab>`, `creator-element-<key>`, `creator-conflict-<key>`,
 * `creator-kept-<key>`, `creator-overwrite-<key>`, `creator-create`, `creator-cancel`,
 * `creator-back`, `creator-status`, `creator-error`. An `image` parameter uses
 * {@link CreatorImageField} (the host's file picker) when `pickImage` is given, otherwise the
 * wizard's file input.
 *
 * @packageDocumentation
 */

import type { Json, Project, ResourceLocation } from '@msm/core';
import type { ContentBundle, ProjectStarter, TargetFacts } from '@msm/plugin-api';
import { ArrowLeft } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeItem } from '../../changeset/changeset';
import {
  applyCreatorPlan,
  type CreatorApplyResult,
  type CreatorPlan,
  creatorChanges,
  creatorLabel,
  creatorValues,
  planCreate,
  reopenPlan,
} from '../../changeset/creator-sets';
import type { ResourceFolders, VanillaAssetReader } from '../../preview/model-chain';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import { ParameterField } from '../wizard/ParameterField';
import {
  defaultRawValues,
  type RawValue,
  type RawValues,
  stepErrors,
  toValues,
} from '../wizard/wizard-model';
import { CreatorAudioField, type PickAudio } from './CreatorAudioField';
import { CreatorImageField, type PickImage } from './CreatorImageField';
import { CreatorPreview } from './CreatorPreview';
import {
  CREATOR_DEBOUNCE_MS,
  CREATOR_GROUPS,
  type CreatorFlow,
  type CreatorTab,
  creatorFlows,
  firstTab,
  parameterGroups,
  rawValuesFromStored,
} from './creator-model';

/** What the Creator needs of the project session. */
export interface CreatorSession {
  library: { starters: readonly ProjectStarter[] };
  target: TargetFacts;
  registry: { get(kind: string): unknown };
  readAsset(namespace: string, path: string): Promise<Uint8Array>;
  importAssets(
    namespace: string,
    files: readonly { name: string; data: Uint8Array }[],
    subfolder: string,
  ): Promise<{ rejected: readonly { name: string; reason: string }[] }>;
  applyChangeset(
    items: readonly ChangeItem[],
    label: string,
  ): Promise<{ applied: string[]; skipped: string[] }>;
}

/** Reopens a set ("Edit in Creator"). */
export interface CreatorEditRequest {
  flowId: string;
  setId: string;
  /** The stored values (`meta.creator.values`). */
  values: Readonly<Record<string, unknown>>;
  /** The namespace the set was built for. */
  namespace: string;
}

/** What {@link CreatorDialogProps.onCreated} receives. */
export interface CreatorCreated extends CreatorApplyResult {
  label: string;
  /** Elements and files that change (creates, replacements, merges, removals and writes). */
  changed: number;
  /** The element ids the plan created, in order. */
  created: ResourceLocation[];
}

/** Props of {@link CreatorDialog}. */
export interface CreatorDialogProps {
  session: CreatorSession;
  project: Project;
  /** The namespaces a new set may go in (the project's own, without `minecraft`). */
  namespaces: readonly string[];
  /** Reopens a set instead of starting with the flow picker. */
  edit?: CreatorEditRequest | null;
  folders: ResourceFolders;
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  vanilla: VanillaAssetReader | null;
  onClose(): void;
  onCreated(result: CreatorCreated): void;
  /** A new set id (default `crypto.randomUUID`). */
  newSetId?(): string;
  /**
   * Opens the host's PNG file picker for an `image` field (`platform.dialogs.pickFiles`,
   * ADR 0044 D7); without it the field falls back to the wizard's file input.
   */
  pickImage?: PickImage;
  /** Opens the host's Ogg file picker for an `audio` field (ADR 0049); else the wizard's input. */
  pickAudio?: PickAudio;
  /** Test hook: overrides WebGL detection in the preview. */
  webgl?: boolean;
  /** Test hook: the rebuild delay (default 150 ms). */
  debounceMs?: number;
}

interface Built {
  bundle: ContentBundle;
  plan: CreatorPlan;
  revision: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function FlowPicker(props: { flows: readonly CreatorFlow[]; onPick(flow: CreatorFlow): void }) {
  const available = props.flows.filter((flow) => flow.unavailable === null);
  const unavailable = props.flows.filter((flow) => flow.unavailable !== null);
  if (props.flows.length === 0) {
    return <p className="text-sm text-muted">No Creator flows are available.</p>;
  }
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-auto" data-testid="creator-flows">
      <p className="text-sm text-muted">
        Choose what to make. You see it change as you fill in the fields, and nothing is added to
        the project until you press Create.
      </p>
      {CREATOR_GROUPS.map(({ group, title }) => {
        const flows = available.filter((flow) => flow.group === group);
        if (flows.length === 0) return null;
        return (
          <section
            key={group}
            aria-labelledby={`creator-group-${group}-heading`}
            data-testid={`creator-group-${group}`}
            className="flex flex-col gap-1.5"
          >
            <h3
              id={`creator-group-${group}-heading`}
              className="text-xs font-semibold tracking-wide text-muted uppercase"
            >
              {title}
            </h3>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 p-0">
              {flows.map((flow) => (
                <li key={flow.starter.id}>
                  <button
                    type="button"
                    data-testid={`creator-flow-${flow.starter.id}`}
                    onClick={() => props.onPick(flow)}
                    className="flex h-full w-full cursor-pointer flex-col items-start gap-0.5 rounded border border-border p-2 text-left hover:border-accent"
                  >
                    <span className="font-medium">{flow.starter.title}</span>
                    <span className="text-xs text-muted">{flow.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {unavailable.length > 0 && (
        <section aria-label="Not available" className="flex flex-col gap-1 text-xs text-muted">
          <h3 className="font-semibold tracking-wide uppercase">Not available</h3>
          <ul className="m-0 list-none p-0">
            {unavailable.map((flow) => (
              <li key={flow.starter.id} data-testid={`creator-unavailable-${flow.starter.id}`}>
                {flow.starter.title}: {flow.unavailable}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The Creator dialog. */
export function CreatorDialog(props: CreatorDialogProps) {
  const { session, project, edit } = props;
  const flows = useMemo(() => creatorFlows(session.library.starters, session.target), [session]);
  const editFlow =
    edit === null || edit === undefined
      ? undefined
      : flows.find((flow) => flow.starter.id === edit.flowId);
  const [flowId, setFlowId] = useState<string | null>(editFlow?.starter.id ?? null);
  const flow = flows.find((entry) => entry.starter.id === flowId) ?? null;
  const starter = flow?.starter ?? null;
  const parameters = starter?.parameters;
  const [raw, setRaw] = useState<RawValues>(() =>
    editFlow !== undefined && edit !== null && edit !== undefined
      ? rawValuesFromStored(editFlow.starter.parameters, edit.values)
      : {},
  );
  const namespaceOptions = edit?.namespace !== undefined ? [edit.namespace] : props.namespaces;
  const [namespace, setNamespace] = useState(namespaceOptions[0] ?? '');
  const [tab, setTab] = useState<CreatorTab>(editFlow !== undefined ? 'elements' : 'items');
  const [built, setBuilt] = useState<Built | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState<ReadonlySet<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const setIdRef = useRef<string | null>(null);
  /** Set when a flow is picked: the first build then chooses the tab ({@link firstTab}). */
  const autoTabRef = useRef(editFlow === undefined);
  const tokenRef = useRef(0);
  const namespaceId = useId();
  const errors = useMemo(
    () => (parameters === undefined ? {} : stepErrors(parameters, raw)),
    [parameters, raw],
  );
  const hasErrors = Object.keys(errors).length > 0;
  const debounce = props.debounceMs ?? CREATOR_DEBOUNCE_MS;

  const newSetId = props.newSetId;
  const setIdFor = useCallback((): string => {
    if (edit !== null && edit !== undefined) return edit.setId;
    if (setIdRef.current === null) {
      setIdRef.current = newSetId?.() ?? crypto.randomUUID();
    }
    return setIdRef.current;
  }, [edit, newSetId]);

  /** Builds the bundle of `values` and plans it against the project. */
  const compute = useCallback(
    async (current: ProjectStarter, values: RawValues): Promise<Omit<Built, 'revision'>> => {
      const converted = toValues(current.parameters, values) as Record<string, Json>;
      const target = session.target;
      const bundle = await current.build({
        namespace,
        projectName: project.name,
        target,
        values: converted,
      });
      const isKnownKind = (kind: string) => session.registry.get(kind) !== undefined;
      const setId = setIdFor();
      const plan =
        edit === null || edit === undefined
          ? planCreate(
              bundle,
              project,
              { flowId: current.id, setId, values: creatorValues(converted) },
              isKnownKind,
            )
          : await reopenPlan({
              project,
              flow: current,
              setId,
              namespace,
              storedValues: toValues(
                current.parameters,
                rawValuesFromStored(current.parameters, edit.values),
              ) as Record<string, Json>,
              newValues: converted,
              target,
              isKnownKind,
              readAsset: (ns, path) => session.readAsset(ns, path).catch(() => null),
              build: (stored) =>
                stored === converted
                  ? bundle
                  : current.build({ namespace, projectName: project.name, target, values: stored }),
            });
      return { bundle, plan };
    },
    [session, project, namespace, edit, setIdFor],
  );

  // Rebuild after the last change; only the newest build is shown.
  useEffect(() => {
    if (starter === null || hasErrors) return;
    const token = ++tokenRef.current;
    const timer = setTimeout(() => {
      compute(starter, raw).then(
        (result) => {
          if (token !== tokenRef.current) return;
          setBuilt({ ...result, revision: token });
          setBuildError(null);
          if (autoTabRef.current) {
            autoTabRef.current = false;
            setTab(firstTab(result.bundle));
          }
        },
        (error: unknown) => {
          if (token !== tokenRef.current) return;
          setBuildError(messageOf(error));
        },
      );
    }, debounce);
    return () => clearTimeout(timer);
  }, [starter, raw, hasErrors, compute, debounce]);

  const pick = (next: CreatorFlow): void => {
    setFlowId(next.starter.id);
    setRaw(defaultRawValues(next.starter.parameters));
    setBuilt(null);
    setBuildError(null);
    setOverwrite(new Set());
    setTab('items');
    autoTabRef.current = true;
  };

  const change = (id: string, value: RawValue): void => {
    setRaw((current) => ({ ...current, [id]: value }));
  };

  const create = async (): Promise<void> => {
    if (starter === null || hasErrors || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      // Plan again from the current values: a rebuild may still be waiting.
      tokenRef.current += 1;
      const { plan } = await compute(starter, raw);
      const changes = creatorChanges(plan, overwrite);
      const label = creatorLabel(plan, starter.title);
      const result = await applyCreatorPlan(session, changes, label);
      const created = changes.items.flatMap((item) =>
        item.op === 'create' && item.elementId !== undefined ? [item.elementId] : [],
      );
      const changed = plan.entries.filter((entry) =>
        overwrite.has(entry.key) && entry.overwrite !== undefined
          ? true
          : entry.change !== undefined && entry.status !== 'unchanged',
      ).length;
      props.onCreated({ ...result, label, created, changed });
    } catch (error) {
      setCreateError(messageOf(error));
      setCreating(false);
    }
  };

  const plan = built?.plan ?? null;
  const pending = plan === null ? null : creatorChanges(plan, overwrite);
  const willChange = pending !== null && pending.items.length + pending.writes.length > 0;
  const editing = edit !== null && edit !== undefined;
  const title = starter === null ? 'Create' : `${editing ? 'Edit' : 'Create'}: ${starter.title}`;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !creating) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="creator-dialog"
          className="fixed inset-4 z-50 flex flex-col gap-2 rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <div className="flex items-center gap-2">
            {starter !== null && !editing && (
              <Button
                data-testid="creator-back"
                aria-label="Back to the flows"
                title="Back to the flows"
                onClick={() => {
                  setFlowId(null);
                  setBuilt(null);
                }}
              >
                <ArrowLeft size={14} aria-hidden />
              </Button>
            )}
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          </div>
          {starter === null ? (
            editing ? (
              <p role="alert" className="text-sm text-error" data-testid="creator-error">
                The flow {edit.flowId} is not available, so this set cannot be reopened.
              </p>
            ) : (
              <FlowPicker flows={flows} onPick={pick} />
            )
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)] gap-3">
              <form
                aria-label="Fields"
                className="flex min-h-0 flex-col gap-3 overflow-auto pr-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void create();
                }}
              >
                {flow?.blurb !== undefined && <p className="text-xs text-muted">{flow.blurb}</p>}
                {namespaceOptions.length > 1 && (
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor={namespaceId} className="text-sm font-medium">
                      Namespace
                    </label>
                    <select
                      id={namespaceId}
                      data-testid="creator-namespace"
                      className={fieldClass}
                      value={namespace}
                      onChange={(event) => setNamespace(event.target.value)}
                    >
                      {namespaceOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {parameterGroups(parameters).map((group) => (
                  <fieldset
                    key={group.title}
                    className="m-0 flex min-w-0 flex-col gap-2 rounded border border-border p-2"
                  >
                    <legend className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
                      {group.title}
                    </legend>
                    {group.parameters.map((parameter) =>
                      parameter.type === 'audio' && props.pickAudio !== undefined ? (
                        <CreatorAudioField
                          key={parameter.id}
                          parameter={parameter}
                          value={
                            typeof raw[parameter.id] === 'string' ? String(raw[parameter.id]) : ''
                          }
                          error={errors[parameter.id] ?? null}
                          pickAudio={props.pickAudio}
                          onChange={(value) => change(parameter.id, value)}
                        />
                      ) : parameter.type === 'image' && props.pickImage !== undefined ? (
                        <CreatorImageField
                          key={parameter.id}
                          parameter={parameter}
                          value={
                            typeof raw[parameter.id] === 'string' ? String(raw[parameter.id]) : ''
                          }
                          error={errors[parameter.id] ?? null}
                          pickImage={props.pickImage}
                          onChange={(value) => change(parameter.id, value)}
                        />
                      ) : (
                        <ParameterField
                          key={parameter.id}
                          parameter={parameter}
                          value={raw[parameter.id] ?? ''}
                          error={errors[parameter.id] ?? null}
                          onChange={(value) => change(parameter.id, value)}
                        />
                      ),
                    )}
                  </fieldset>
                ))}
                {/* Enter in a text field creates, as in the other dialogs. */}
                <button type="submit" hidden tabIndex={-1} aria-hidden />
              </form>
              <div className="flex min-h-0 flex-col rounded border border-border">
                {built === null ? (
                  <p className="p-2 text-sm text-muted" data-testid="creator-status">
                    {hasErrors
                      ? 'Fix the highlighted fields to see the preview.'
                      : (buildError ?? 'Building the preview…')}
                  </p>
                ) : (
                  <CreatorPreview
                    bundle={built.bundle}
                    revision={built.revision}
                    plan={hasErrors ? null : built.plan}
                    project={project}
                    folders={props.folders}
                    readProjectAsset={props.readProjectAsset}
                    vanilla={props.vanilla}
                    overwrite={overwrite}
                    onOverwriteChange={(key, next) =>
                      setOverwrite((current) => {
                        const copy = new Set(current);
                        if (next) copy.add(key);
                        else copy.delete(key);
                        return copy;
                      })
                    }
                    tab={tab}
                    onTabChange={setTab}
                    {...(props.webgl === undefined ? {} : { webgl: props.webgl })}
                  />
                )}
                {built !== null && buildError !== null && (
                  <p role="alert" className="p-2 text-xs text-error" data-testid="creator-error">
                    The preview could not be rebuilt: {buildError}
                  </p>
                )}
              </div>
            </div>
          )}
          {createError !== null && (
            <p role="alert" className="text-sm text-error" data-testid="creator-error">
              Create failed: {createError}
            </p>
          )}
          <div className="flex items-center justify-end gap-1.5">
            {starter !== null && plan !== null && !willChange && (
              <span className="mr-auto text-xs text-muted">Nothing to change.</span>
            )}
            <Button
              data-testid="creator-create"
              disabled={starter === null || hasErrors || built === null || creating || !willChange}
              onClick={() => void create()}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
            <Button data-testid="creator-cancel" disabled={creating} onClick={props.onClose}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
