/**
 * The Mob Studio's "Bucket" section (ADR 0109 D1, ADR 0112 D1): `msm:bucketable` on or off
 * ("Can be caught in a bucket"), whether the bucket holds water (a water bucket takes the mob
 * and releasing it pours water; without, an empty bucket takes it), and the bucket's name and
 * picture (`bucket_display_name`, `bucket_texture`, element fields lowering writes to the bucket
 * item). Only a mob that swims can be caught; the section says so in words when it does not.
 *
 * @packageDocumentation
 */

import { BUCKETABLE_COMPONENT } from '@msm/plugin-entities';
import { typingKey } from '../../forms/context';
import { asObject, pointerOf } from '../blocks-items/blocks-items-model';
import { ProblemsAt, TextField } from '../blocks-items/parts';
import { TextureThumbnail } from '../blocks-items/TexturesSection';
import { IdField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { componentTools, DefaultCheck, FieldProblems } from './MobKindSection';
import { type MobSectionProps, modeOf } from './mob-kinds';

/** The bucket's name when none is given: "Bucket of" and the mob's name. */
export function bucketNameFallback(data: MobSectionProps['data']): string {
  const name = asObject(data).display_name;
  return `Bucket of ${typeof name === 'string' && name.trim() !== '' ? name : 'the mob'}`;
}

/** The "Bucket" section. */
export function BucketSection(props: MobSectionProps) {
  const tools = componentTools(props, BUCKETABLE_COMPONENT);
  const data = asObject(props.data);
  const swims = modeOf(props.data) === 'swim';
  const picture = typeof data.bucket_texture === 'string' ? data.bucket_texture : '';
  return (
    <Section title="Bucket" testId="entity-bucket">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-bucket-on"
          checked={tools.on}
          onChange={(event) => tools.toggle(event.target.checked, () => ({}))}
        />
        Can be caught in a bucket
      </label>
      {tools.on ? (
        <>
          {!swims && (
            <p className="text-warning text-xs" data-testid="entity-bucket-needs-swim">
              Only a mob that swims can be caught in a bucket. Pick "Swims" under Movement.
            </p>
          )}
          <DefaultCheck
            label="Bucket holds water"
            value={tools.value.water}
            fallback
            testId="entity-bucket-water"
            onChange={(next) => tools.setField('water', next)}
          />
          <p className="text-muted text-xs" data-testid="entity-bucket-how">
            {tools.value.water === false
              ? 'An empty bucket takes the mob, and using the bucket lets it out without water.'
              : 'A water bucket takes the mob, and pouring the bucket lets it out with the water.'}{' '}
            The bucket keeps its name and health.
          </p>
          <TextField
            label="Bucket name"
            value={data.bucket_display_name}
            testId="entity-bucket-name"
            placeholder={bucketNameFallback(props.data)}
            onCommit={(value) =>
              props.set(['bucket_display_name'], value, typingKey('/bucket_display_name'))
            }
          />
          <div className="flex items-end gap-2">
            <TextureThumbnail texture={picture} testId="entity-bucket-picture-thumbnail" />
            <IdField
              label="Bucket picture (optional)"
              value={picture}
              registry="texture"
              suggest={props.suggest}
              testId="entity-bucket-picture"
              onCommit={(value) => props.set(['bucket_texture'], value === '' ? undefined : value)}
            />
          </div>
          <p className="text-muted text-xs">
            Empty uses Minecraft's {tools.value.water === false ? 'empty' : 'water'} bucket picture.
          </p>
        </>
      ) : (
        <p className="text-muted text-xs">The mob cannot be caught in a bucket.</p>
      )}
      <ProblemsAt problems={props.problems} pointer={pointerOf(['bucket_display_name'])} />
      <ProblemsAt problems={props.problems} pointer={pointerOf(['bucket_texture'])} />
      <FieldProblems
        problems={props.problems}
        component={BUCKETABLE_COMPONENT}
        keys={['item_name', 'water']}
      />
    </Section>
  );
}
