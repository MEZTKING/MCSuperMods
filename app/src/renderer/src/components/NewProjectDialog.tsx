/**
 * The "New project" dialog (ADR 0020; wizards ADR 0040): the project starters the registered
 * plugins contribute, grouped by category with layer badges. A starter without parameters
 * creates in one step; a starter with parameters continues as a wizard ({@link StarterWizard}):
 * one step per parameter group, then "Choose folder and create" with the target select.
 * Creating hands the choice to the host, which asks for an empty folder and creates the
 * project there.
 *
 * @packageDocumentation
 */

import type { Json, OutputLayer, ProjectStarter, TargetFacts } from '@msm/plugin-api';
import { Dialog } from 'radix-ui';
import { type FormEvent, useId, useState } from 'react';
import { Button } from './ui/Button';
import { StarterWizard, TargetSelect } from './wizard/StarterWizard';
import {
  CHOOSE_STARTER_TITLE,
  CREATE_STEP_TITLE,
  defaultRawValues,
  hasParameters,
  pickTargetId,
  type RawValues,
  targetsFor,
  toValues,
  wizardSteps,
} from './wizard/wizard-model';

/** What {@link NewProjectDialogProps.onCreate} receives. */
export interface NewProjectRequest {
  /** The chosen starter's id, or `null` for the host's blank project. */
  starterId: string | null;
  /**
   * The project folder, or `null` when the host still has to ask for one. This dialog always
   * passes `null`: the host opens the folder picker after it closes.
   */
  folder: string | null;
  /** The chosen target's id (`defaultTargetId` when no targets were offered). */
  targetId: string;
  /** `BundleContext.values`: every declared parameter, defaults filled in; `{}` without parameters. */
  values: Record<string, Json>;
}

/** Props of {@link NewProjectDialog}. */
export interface NewProjectDialogProps {
  /** The starters to offer (`session.library.starters`: already limited to registered kinds). */
  starters: readonly ProjectStarter[];
  /**
   * The targets a new project can use (B160 passes `session.availableTargets`). Without
   * targets the dialog shows no target select. Default none.
   */
  targets?: readonly TargetFacts[];
  /** The target preselected in the select (never a snapshot by policy); default the first release target. */
  defaultTargetId?: string;
  onCancel(): void;
  /**
   * Creates the project with the chosen starter, target and wizard values. When absent the
   * dialog calls {@link onSubmit} instead (the wizard values are then dropped, so a wizard
   * starter builds with its defaults).
   */
  onCreate?(request: NewProjectRequest): void;
  /** The chosen starter, or `null` for a blank project without a starter (before `onCreate`). */
  onSubmit?(starter: ProjectStarter | null): void;
  /**
   * Opens the Creator in the open project instead (ADR 0043 D3); the list then ends with
   * "or Create something with the Creator" (`new-project-open-creator`). Hidden when absent.
   */
  onOpenCreator?(): void;
}

/** The id of the host's own blank entry, offered when no plugin contributes a blank starter. */
export const HOST_BLANK_ID = 'blank';

/** Headings of the starter categories, in display order. */
export const STARTER_GROUPS: readonly { category: ProjectStarter['category']; title: string }[] = [
  { category: 'blank', title: 'Blank' },
  { category: 'pack', title: 'Packs' },
  { category: 'content', title: 'Themed content' },
];

/** The badge text of an output layer. */
export function layerLabel(layer: OutputLayer): string {
  switch (layer) {
    case 'resourcepack':
      return 'Resource pack';
    case 'datapack':
      return 'Data pack';
    default:
      return 'Mod';
  }
}

/** One option of the list: a plugin starter, or the host's blank entry (`starter: null`). */
interface StarterOption {
  id: string;
  title: string;
  description: string;
  category: ProjectStarter['category'];
  layers: readonly OutputLayer[];
  starter: ProjectStarter | null;
}

/**
 * The options in display order: the starters by category, with a host "Blank project" entry
 * first when no starter is in the `blank` category.
 */
export function starterOptions(starters: readonly ProjectStarter[]): StarterOption[] {
  const options: StarterOption[] = starters.map((starter) => ({
    id: starter.id,
    title: starter.title,
    description: starter.description,
    category: starter.category,
    layers: starter.layers,
    starter,
  }));
  if (!starters.some((starter) => starter.category === 'blank')) {
    options.unshift({
      id: HOST_BLANK_ID,
      title: 'Blank project',
      description: 'A namespace and its pack.mcmeta, nothing else.',
      category: 'blank',
      layers: [],
      starter: null,
    });
  }
  const order = STARTER_GROUPS.map((group) => group.category);
  return options
    .map((option, index) => ({ option, index }))
    .sort(
      (a, b) =>
        order.indexOf(a.option.category) - order.indexOf(b.option.category) || a.index - b.index,
    )
    .map((entry) => entry.option);
}

/** Lists the project starters, runs a starter's wizard, then hands the choice to the host. */
export function NewProjectDialog(props: NewProjectDialogProps) {
  const options = starterOptions(props.starters);
  const targets = props.targets ?? [];
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? HOST_BLANK_ID);
  const [stage, setStage] = useState<'list' | 'wizard'>('list');
  const [valuesByStarter, setValuesByStarter] = useState<Record<string, RawValues>>({});
  const [targetId, setTargetId] = useState(pickTargetId(targets, props.defaultTargetId ?? ''));
  const selected = options.find((option) => option.id === selectedId);
  const starter = selected?.starter ?? null;
  const wizard = hasParameters(starter);
  const values = valuesByStarter[selectedId] ?? defaultRawValues(starter?.parameters);
  const offered = targetsFor(starter, targets);
  const hintId = useId();
  const total = 1 + wizardSteps(starter?.parameters).length + (wizard ? 1 : 0);

  const create = (): void => {
    const request: NewProjectRequest = {
      starterId: starter?.id ?? null,
      folder: null,
      targetId: pickTargetId(offered, targetId),
      values: toValues(starter?.parameters, values),
    };
    if (props.onCreate !== undefined) props.onCreate(request);
    else props.onSubmit?.(starter);
  };

  const submitList = (event: FormEvent): void => {
    event.preventDefault();
    if (wizard) setStage('wizard');
    else create();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="new-project-dialog"
          className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="mb-1.5 text-base font-semibold">New project</Dialog.Title>
          {stage === 'wizard' && starter !== null && wizard ? (
            <StarterWizard
              starter={starter}
              targets={targets}
              targetId={targetId}
              onTargetChange={setTargetId}
              values={values}
              onValuesChange={(next) =>
                setValuesByStarter((all) => ({ ...all, [selectedId]: next }))
              }
              firstStep={2}
              onBack={() => setStage('list')}
              onCancel={props.onCancel}
              onCreate={create}
              createTestId="new-project-dialog-submit"
            />
          ) : (
            <form onSubmit={submitList} className="flex flex-col gap-1.5">
              {total > 1 && (
                <p className="text-xs text-muted" data-testid="wizard-progress">
                  Step 1 of {total}
                </p>
              )}
              <p id={hintId} className="text-xs text-muted">
                {wizard
                  ? `${CHOOSE_STARTER_TITLE}. This one asks a few questions next, then you choose an empty folder; its name becomes the project's namespace.`
                  : "Pick a starting point. Next you choose an empty folder; its name becomes the project's namespace."}
              </p>
              <div
                role="radiogroup"
                aria-label="Starter"
                aria-describedby={hintId}
                className="flex max-h-[55vh] flex-col gap-2 overflow-auto"
                data-testid="starter-picker"
              >
                <div className="flex flex-col gap-2" data-testid="wizard-step-1">
                  {STARTER_GROUPS.map((group) => {
                    const entries = options.filter((option) => option.category === group.category);
                    if (entries.length === 0) return null;
                    return (
                      <fieldset
                        key={group.category}
                        data-testid={`starter-group-${group.category}`}
                        className="m-0 min-w-0 border-0 p-0 flex flex-col gap-1"
                      >
                        <legend className="text-xs font-semibold tracking-wide text-muted uppercase">
                          {group.title}
                        </legend>
                        {entries.map((option) => (
                          <label
                            key={option.id}
                            className={
                              'flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 ' +
                              (option.id === selectedId ? 'border-accent bg-bg' : 'border-border')
                            }
                          >
                            <input
                              type="radio"
                              name="starter"
                              value={option.id}
                              className="mt-1"
                              data-testid={`starter-${option.id}`}
                              checked={option.id === selectedId}
                              onChange={() => setSelectedId(option.id)}
                            />
                            <span className="flex min-w-0 flex-col">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{option.title}</span>
                                {option.layers.map((layer) => (
                                  <span
                                    key={layer}
                                    className="rounded border border-border px-1 text-[0.7rem] text-muted"
                                    data-testid={`starter-${option.id}-layer-${layer}`}
                                  >
                                    {layerLabel(layer)}
                                  </span>
                                ))}
                                {hasParameters(option.starter) && (
                                  <span
                                    className="rounded border border-border px-1 text-[0.7rem] text-muted"
                                    data-testid={`starter-${option.id}-wizard`}
                                  >
                                    Wizard
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted">{option.description}</span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    );
                  })}
                </div>
              </div>
              {props.onOpenCreator !== undefined && (
                <button
                  type="button"
                  data-testid="new-project-open-creator"
                  className="self-start cursor-pointer text-sm text-accent underline-offset-2 hover:underline"
                  onClick={props.onOpenCreator}
                >
                  or Create something with the Creator
                </button>
              )}
              {!wizard && (
                <TargetSelect
                  targets={offered}
                  targetId={pickTargetId(offered, targetId)}
                  onChange={setTargetId}
                />
              )}
              <div className="mt-2 flex gap-1.5">
                {wizard ? (
                  <Button type="submit" data-testid="wizard-next">
                    Next
                  </Button>
                ) : (
                  <Button type="submit" data-testid="new-project-dialog-submit">
                    {CREATE_STEP_TITLE}
                  </Button>
                )}
                <Dialog.Close asChild>
                  <Button>Cancel</Button>
                </Dialog.Close>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
