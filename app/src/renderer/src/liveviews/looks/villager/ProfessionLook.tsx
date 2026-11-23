/**
 * The look of a village job (`msm:villager_profession`; the plan's batch 3 table; B627): the
 * villager stand-in wearing a look (one of the project's or Minecraft's, plains by default), the
 * job's clothes over it and the badge of the level picked, Novice to Master. The Profession
 * Studio's Pictures draw {@link ProfessionLookFrame}; the registry's view (the Creator and the AI
 * review) draws it above the trades on Try it's merchant screen, which B615's view showed and
 * which stay. Follows an edit at once. Names only, never ids (the Studio is open in Very easy).
 *
 * @packageDocumentation
 */

import type { Element, Project } from '@msm/plugin-api';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { factsOf } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { BODY_NOTES } from '../variant/variant-model';
import { ChoiceSelect, LevelPicker, VillagerBody } from './VillagerLook';
import { jobOf, LEVEL_WORDS, lookChoices, villagerPicture } from './villager-look';

/** Props of {@link ProfessionLookFrame}. */
export interface ProfessionLookProps {
  readonly project: Project;
  readonly element: Pick<Element, 'id' | 'kind' | 'data'>;
  readonly vanillaAssets: VanillaAssetReader | null;
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  readonly onSetup?: () => void;
  /** What goes under the body (the registry's view puts the trades there). */
  readonly children?: ReactNode;
}

/** The merchant screen, a chunk of its own (it lowers the project's trade files). */
const MerchantPart = lazy(() =>
  import('../../existing/MerchantPart').then((module) => ({ default: module.MerchantPart })),
);

/** The look Minecraft's villagers wear by default. */
export const DEFAULT_LOOK = 'minecraft:plains';

/** The job's look in its frame; see the module comment. */
export function ProfessionLookFrame(props: ProfessionLookProps) {
  const { project, element } = props;
  const [lookKey, setLookKey] = useState(DEFAULT_LOOK);
  const [level, setLevel] = useState(1);
  const folders = resourceFoldersOf(project);
  const vanillaTypes = factsOf(project)?.entities?.villagerTypes ?? [DEFAULT_LOOK];
  const looks = folders === null ? [] : lookChoices(project, folders, vanillaTypes);
  const look =
    looks.find((choice) => choice.key === lookKey) ??
    looks.find((choice) => choice.key === DEFAULT_LOOK) ??
    looks[0] ??
    null;
  const job = folders === null ? null : jobOf(project, element, folders);
  const picture = villagerPicture(element.data);
  const words = job?.words ?? '';
  return (
    <LiveViewFrame
      title="Village job"
      fidelity="about_right"
      notes={[
        ...BODY_NOTES,
        'Which hat shows over which is not worked out here, and babies are not shown.',
      ]}
      needsSetUp={props.vanillaAssets === null}
      {...(props.onSetup === undefined ? {} : { onSetup: props.onSetup })}
      controls={
        <div className="flex flex-wrap items-center gap-3">
          {looks.length > 1 && (
            <ChoiceSelect
              label="Wearing the look"
              choices={looks}
              value={look?.key ?? ''}
              onChange={setLookKey}
              testId="profession-look-type"
            />
          )}
          <LevelPicker level={level} onChange={setLevel} testId="profession-look-level" />
        </div>
      }
    >
      <p className="text-sm" data-testid="profession-look-words">
        {picture === undefined
          ? `${words}: no picture yet, so the villager is drawn without the job’s clothes.`
          : `${words}: the job’s clothes at ${LEVEL_WORDS[level - 1] ?? ''} level, over ${look?.words ?? 'a villager'}.`}
      </p>
      {folders !== null && (
        <VillagerBody
          project={project}
          folders={folders}
          look={look}
          job={job}
          level={level}
          vanillaAssets={props.vanillaAssets}
          readProject={props.readProject}
          label={`A villager with the ${words} job`}
          testId="profession-look-body"
        />
      )}
      {props.children}
    </LiveViewFrame>
  );
}

/** The registry's view: the look above the trades (the Creator and the AI review). */
export default function ProfessionLook(props: LiveViewProps) {
  return (
    <ProfessionLookFrame
      project={props.project}
      element={props.element}
      vanillaAssets={props.vanillaAssets}
      readProject={props.readProject}
      onSetup={props.onSetup}
    >
      <Suspense fallback={<p className="text-sm text-muted">Reading the trades…</p>}>
        <MerchantPart project={props.project} element={props.element} testId="live-merchant" />
      </Suspense>
    </ProfessionLookFrame>
  );
}
