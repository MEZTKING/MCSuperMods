/**
 * Profession Studio (ADR 0098 D2, ADR 0101 D1) for `msm:villager_profession` element data,
 * loaded lazily:
 *
 * - "Job": the job's name over the trading screen and the job site block (the project's blocks
 *   offered first; a vanilla workstation, bed or bell is refused).
 * - "Pictures": the villager's and the zombie villager's picture. The game draws them only from
 *   fixed places (`professionTexturePaths`), so choosing a picture stored elsewhere also copies
 *   it there in the same undo step; "Copy the pictures" does it for pictures added before.
 * - "Trades": the five levels in the trade editor of the Trader section, writing the level tags
 *   `<ns>:<path>/level_<n>` that lowering's default trade sets draw two trades from; or, with
 *   `trade_sets` set, the five trade sets named.
 * - "Work": the work sound, the items villagers pick up and the extra blocks they work at.
 *
 * Everything else stays behind "Advanced (all fields)".
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { PROFESSION_LEVELS } from '@msm/plugin-entities';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { typingKey } from '../../forms/context';
import {
  asObject,
  pathSetter,
  pointerOf,
  withProjectIds,
} from '../blocks-items/blocks-items-model';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { ProblemsAt, TextField } from '../blocks-items/parts';
import { TextureThumbnail } from '../blocks-items/TexturesSection';
import { IdField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, IdList, Section } from '../worldgen/parts';
import {
  missingPictureCopies,
  type ProfessionPictureCopy,
  pictureChange,
  professionPictureCopies,
  withPicture,
} from './profession-model';
import { TradeEditor } from './TradeEditor';
import { professionLevelLayout, TRADE_LEVEL_LABELS } from './trade-model';

const strings = (value: Json | undefined): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/** The Profession Studio. */
export default function ProfessionStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange, target } = props;
  const host = useBlocksItemsStudioHost();
  const [advanced, setAdvanced] = useState(false);
  const [level, setLevel] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section
        aria-label="Profession Studio"
        data-testid="profession-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="profession-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const apply = host?.applyChanges;
  const read = host?.modelPreview?.readProjectAsset;
  const projectBlocks = project.namespaces.flatMap((namespace) =>
    namespace.elements.filter((entry) => entry.kind === 'msm:block').map((entry) => entry.id),
  );
  const jobSite = typeof data.job_site === 'string' ? data.job_site : '';
  const vanillaSites = Object.values(target.entities?.vanillaJobSites ?? {}).flat();
  const textures = asObject(data.textures);
  const picture = (slot: 'villager' | 'zombie_villager') =>
    typeof textures[slot] === 'string' ? String(textures[slot]) : '';

  /** Writes `after` and the picture copies it needs as one undo step. */
  const writePictures = (after: Json, label: string) => {
    const copies = professionPictureCopies(target, { ...element, data: after });
    if (apply === undefined || read === undefined) {
      onChange('', after);
      return;
    }
    setError(null);
    Promise.all(
      copies.map(async (copy: ProfessionPictureCopy) => ({
        copy,
        bytes: await read(copy.from.namespace, copy.from.path),
      })),
    )
      .then(async (found) => {
        const ready = found.filter(
          (entry): entry is { copy: ProfessionPictureCopy; bytes: Uint8Array } =>
            entry.bytes !== null,
        );
        const change = pictureChange(project, element, after, ready);
        if (change.items.length === 0 && change.writes.length === 0) return;
        await apply(change.items, label, change.writes);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  const missing = missingPictureCopies(project, target, element);

  const job = (
    <Section title="Job" testId="profession-job">
      <TextField
        label="Name of the job"
        value={data.display_name}
        testId="profession-name"
        placeholder="Blacksmith"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <IdField
        label="Job site block"
        value={jobSite}
        registry="block"
        suggest={withProjectIds(suggest, 'block', projectBlocks)}
        testId="profession-job-site"
        onCommit={(value) => set(['job_site'], value)}
      />
      {at(['job_site'])}
      {jobSite !== '' && vanillaSites.includes(jobSite) && (
        <p className="text-warning text-xs" data-testid="profession-job-site-taken">
          That block already belongs to Minecraft (a workstation, bed or bell). Pick a block of your
          own.
        </p>
      )}
      <p className="text-muted text-xs">
        A villager without a job takes this one at its job site block, as at a workstation.
      </p>
    </Section>
  );

  const pictures = (
    <Section title="Pictures" testId="profession-pictures">
      {(['villager', 'zombie_villager'] as const).map((slot) => (
        <div key={slot} className="flex items-end gap-2">
          <TextureThumbnail
            texture={picture(slot)}
            testId={`profession-picture-${slot}-thumbnail`}
          />
          <IdField
            label={slot === 'villager' ? 'Villager picture' : 'Zombie villager picture (optional)'}
            value={picture(slot)}
            registry="texture"
            suggest={suggest}
            testId={`profession-picture-${slot}`}
            onCommit={(value) =>
              writePictures(withPicture(element.data, slot, value), 'Profession picture')
            }
          />
        </div>
      ))}
      {at(['textures'])}
      <p className="text-muted text-xs">
        The job's clothes, drawn over the villager. Empty zombie picture uses the villager's.
      </p>
      {missing.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="profession-pictures-missing">
          <p className="text-warning text-xs">
            The game looks for these pictures in a fixed place, and they are not there yet.
          </p>
          <Button
            className="self-start text-xs"
            data-testid="profession-pictures-copy"
            disabled={apply === undefined || read === undefined}
            onClick={() => writePictures(element.data, 'Copy profession pictures')}
          >
            Copy the pictures to where the game looks
          </Button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-error text-xs" data-testid="profession-error">
          {error}
        </p>
      )}
    </Section>
  );

  const ownSets = !Array.isArray(data.trade_sets);
  const named = strings(data.trade_sets);
  const trades = (
    <Section title="Trades" testId="profession-trades">
      {ownSets ? (
        <>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Trading level">
            {Array.from({ length: PROFESSION_LEVELS }, (_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index + 1 === level}
                data-testid={`profession-level-${index + 1}`}
                className={`rounded border px-2 py-0.5 text-xs ${
                  index + 1 === level ? 'border-accent' : 'border-border'
                }`}
                onClick={() => setLevel(index + 1)}
              >
                {TRADE_LEVEL_LABELS[index]}
              </button>
            ))}
          </div>
          <TradeEditor
            project={project}
            layout={professionLevelLayout(element.id, level)}
            suggest={suggest}
            apply={apply}
            testId="profession-trades-editor"
          />
          <p className="text-muted text-xs">
            At each level a villager offers two of that level's trades, picked at random, as
            vanilla's villagers do.
          </p>
        </>
      ) : (
        <>
          <p className="text-muted text-xs" data-testid="profession-named-sets">
            Each level draws its offers from the trade set named here.
          </p>
          {Array.from({ length: PROFESSION_LEVELS }, (_, index) => (
            <IdField
              key={index}
              label={TRADE_LEVEL_LABELS[index] as string}
              value={named[index] ?? ''}
              registry="trade_set"
              suggest={suggest}
              testId={`profession-trade-set-${index + 1}`}
              onCommit={(value) => set(['trade_sets', index], value)}
            />
          ))}
          <Button
            className="self-start text-xs"
            data-testid="profession-own-trades"
            onClick={() => set(['trade_sets'], undefined)}
          >
            Use its own trades
          </Button>
        </>
      )}
      {at(['trade_sets'])}
    </Section>
  );

  const work = (
    <Section title="Work" testId="profession-work">
      <IdField
        label="Work sound"
        value={typeof data.work_sound === 'string' ? data.work_sound : ''}
        registry="sound_event"
        suggest={suggest}
        testId="profession-work-sound"
        onCommit={(value) => set(['work_sound'], value === '' ? undefined : value)}
      />
      {at(['work_sound'])}
      <div className="flex flex-col gap-0.5 text-xs">
        <span className="text-muted">Items it picks up</span>
        <IdList
          label="Item it picks up"
          ids={strings(data.requested_items)}
          registry="item"
          suggest={suggest}
          pointer={pointerOf(['requested_items'])}
          problems={problems}
          onChange={(next) => set(['requested_items'], next.length === 0 ? undefined : next)}
        />
      </div>
      <div className="flex flex-col gap-0.5 text-xs">
        <span className="text-muted">Other blocks it works at</span>
        <IdList
          label="Other block it works at"
          ids={strings(data.secondary_job_blocks)}
          registry="block"
          suggest={suggest}
          pointer={pointerOf(['secondary_job_blocks'])}
          problems={problems}
          onChange={(next) => set(['secondary_job_blocks'], next.length === 0 ? undefined : next)}
        />
      </div>
    </Section>
  );

  return (
    <section
      aria-label="Profession Studio"
      data-testid="profession-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle
        checked={advanced}
        onChange={setAdvanced}
        testId="profession-advanced-toggle"
      />
      <ProblemsAt problems={problems} pointer="" />
      {job}
      {pictures}
      {trades}
      {work}
    </section>
  );
}
