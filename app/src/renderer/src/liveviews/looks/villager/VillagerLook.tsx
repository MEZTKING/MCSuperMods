/**
 * A villager stand-in wearing a look, a job's clothes and a level badge (B627; ADR 0121 D4), shared
 * by the Villager look and Profession views: the controls (the job or the look to wear with it,
 * and the trading level) and the body (`BodyLook` over the villager body of `looks/bodies/`).
 * Names only, never ids, so Very easy can show it.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/plugin-api';
import type { ResourceFolders, VanillaAssetReader } from '../../../preview/model-chain';
import { bodyFor } from '../bodies';
import { BodyLook } from '../variant/BodyLook';
import type { JobChoice, LookChoice } from './villager-look';
import { LEVEL_WORDS, villagerLayers } from './villager-look';

/** The level buttons, Novice to Master. */
export function LevelPicker(props: {
  level: number;
  onChange(level: number): void;
  testId: string;
}) {
  return (
    <fieldset className="m-0 border-0 p-0 flex flex-wrap gap-1">
      <legend className="sr-only">Trading level</legend>
      {LEVEL_WORDS.map((words, index) => (
        <button
          key={words}
          type="button"
          aria-pressed={index + 1 === props.level}
          data-testid={`${props.testId}-${index + 1}`}
          className={`rounded border px-2 py-0.5 text-xs ${index + 1 === props.level ? 'border-accent' : 'border-border'}`}
          onClick={() => props.onChange(index + 1)}
        >
          {words}
        </button>
      ))}
    </fieldset>
  );
}

/** A choice from a list, by key, as a select. */
export function ChoiceSelect<T extends { key: string; words: string }>(props: {
  label: string;
  choices: readonly T[];
  value: string;
  onChange(key: string): void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="text-muted">{props.label}</span>
      <select
        className="rounded border border-border bg-bg px-1 py-0.5"
        value={props.value}
        data-testid={props.testId}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.choices.map((choice) => (
          <option key={choice.key} value={choice.key}>
            {choice.words}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The body. */
export function VillagerBody(props: {
  project: Project;
  folders: ResourceFolders;
  look: LookChoice | null;
  job: JobChoice | null;
  level: number;
  vanillaAssets: VanillaAssetReader | null;
  readProject: ((path: string) => Promise<Uint8Array | null>) | undefined;
  label: string;
  testId: string;
}) {
  const body = bodyFor('msm:villager_type', undefined, false);
  if (body === 'flat_sheet') return null;
  const layers = villagerLayers(props.folders, props.look, props.job, props.level);
  return (
    <BodyLook
      body={body}
      bodyKey="villager"
      layers={layers}
      source={{ vanillaAssets: props.vanillaAssets, readProject: props.readProject }}
      label={props.label}
      debounceMs={0}
      testId={props.testId}
    />
  );
}
