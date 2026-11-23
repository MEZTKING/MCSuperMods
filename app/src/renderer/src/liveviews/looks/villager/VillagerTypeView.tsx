/**
 * A villager look (`msm:villager_type`; the plan's batch 3 table; B627): the villager stand-in
 * wearing the look's clothes over the villager picture, and, with a job of the project picked, the
 * job's clothes and the badge of a level over it. Drawn in the Villager look Studio's Pictures
 * ({@link VillagerTypeLookFrame}) and, as the registry's view, in the Creator and the AI review.
 * Follows an edit at once. Names only, never ids (the Studio is open in Very easy).
 *
 * @packageDocumentation
 */

import type { Element, Project } from '@msm/plugin-api';
import { useState } from 'react';
import { thingName } from '../../../components/thing-picker/thing-sources';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { BODY_NOTES } from '../variant/variant-model';
import { ChoiceSelect, LevelPicker, VillagerBody } from './VillagerLook';
import { jobChoices, lookOf, villagerPicture } from './villager-look';

/** Props of {@link VillagerTypeLookFrame}. */
export interface VillagerTypeLookProps {
  readonly project: Project;
  readonly element: Pick<Element, 'id' | 'kind' | 'data'>;
  readonly vanillaAssets: VanillaAssetReader | null;
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  readonly onSetup?: () => void;
}

/** The look in its frame; see the module comment. */
export function VillagerTypeLookFrame(props: VillagerTypeLookProps) {
  const { project, element } = props;
  const [jobKey, setJobKey] = useState('');
  const [level, setLevel] = useState(1);
  const folders = resourceFoldersOf(project);
  const name = thingName(project, element.id);
  const picture = villagerPicture(element.data);
  const jobs = folders === null ? [] : jobChoices(project, folders);
  const job = jobs.find((choice) => choice.key === jobKey && choice.key !== '') ?? null;
  return (
    <LiveViewFrame
      title="Villager look"
      fidelity="about_right"
      notes={[
        ...BODY_NOTES,
        'Which hat shows over which is not worked out here, and babies are not shown.',
      ]}
      needsSetUp={props.vanillaAssets === null}
      {...(props.onSetup === undefined ? {} : { onSetup: props.onSetup })}
      controls={
        jobs.length > 1 ? (
          <div className="flex flex-wrap items-center gap-3">
            <ChoiceSelect
              label="With the job"
              choices={jobs}
              value={job?.key ?? ''}
              onChange={setJobKey}
              testId="villager-type-look-job"
            />
            {job !== null && (
              <LevelPicker level={level} onChange={setLevel} testId="villager-type-look-level" />
            )}
          </div>
        ) : undefined
      }
    >
      <p className="text-sm" data-testid="villager-type-look-words">
        {picture === undefined
          ? `${name}: no picture yet, so the villager is drawn without the look’s clothes.`
          : `${name}: the look’s clothes on a villager${job === null ? '' : `, with the clothes of the ${job.words} job`}.`}
      </p>
      {folders !== null && (
        <VillagerBody
          project={project}
          folders={folders}
          look={lookOf(project, element, folders)}
          job={job}
          level={level}
          vanillaAssets={props.vanillaAssets}
          readProject={props.readProject}
          label={`A villager wearing ${name}`}
          testId="villager-type-look-body"
        />
      )}
    </LiveViewFrame>
  );
}

/** The registry's view (the Creator and the AI review). */
export default function VillagerTypeView(props: LiveViewProps) {
  return (
    <VillagerTypeLookFrame
      project={props.project}
      element={props.element}
      vanillaAssets={props.vanillaAssets}
      readProject={props.readProject}
      onSetup={props.onSetup}
    />
  );
}
