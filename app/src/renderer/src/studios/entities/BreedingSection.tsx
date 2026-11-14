/**
 * The Entity Studio's "Breeding" section (B297, ADR 0071 D2): `msm:breedable` on or off, the
 * breeding items, the baby size and grow-up time, tempting and following parents, and the
 * on-breed event. Needs base `animal`.
 *
 * @packageDocumentation
 */

import { EventSelect } from '../blocks-items/parts';
import { NumberField } from '../structures/pickers';
import { IdList, Section } from '../worldgen/parts';
import { componentTools, DefaultCheck, FieldProblems, numberAt } from './MobKindSection';
import { baseOf, type MobSectionProps, newBreedable } from './mob-kinds';
import { NEEDS_ANIMAL_NOTE } from './TamingSection';

const BREEDABLE = 'msm:breedable';
const FIELDS = [
  'items',
  'baby_scale',
  'grow_up_ticks',
  'tempted',
  'follow_parents',
  'on_breed',
] as const;

/** The "Breeding" section. */
export function BreedingSection(props: MobSectionProps) {
  const tools = componentTools(props, BREEDABLE);
  const { value } = tools;
  const items = Array.isArray(value.items)
    ? value.items.filter((id): id is string => typeof id === 'string')
    : [];
  const animal = baseOf(props.data) === 'animal';
  return (
    <Section title="Breeding" testId="entity-breeding">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-breedable"
          checked={tools.on}
          onChange={(event) => tools.toggle(event.target.checked, newBreedable)}
        />
        Can have babies
      </label>
      {!animal && (
        <p className="text-muted text-xs" data-testid="entity-breeding-needs-animal">
          {NEEDS_ANIMAL_NOTE}
        </p>
      )}
      {tools.on ? (
        <>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">Breeding food</span>
            <IdList
              label="Breeding food"
              ids={items}
              registry="item"
              suggest={props.suggest}
              pointer={tools.pointer('items')}
              problems={props.problems}
              onChange={(next) => tools.setField('items', next)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <NumberField
              label="Baby size"
              value={numberAt(value, 'baby_scale')}
              allowEmpty
              testId="entity-baby-scale"
              onCommit={(next) => tools.setField('baby_scale', next, true)}
            />
            <NumberField
              label="Grows up after (ticks)"
              value={numberAt(value, 'grow_up_ticks')}
              integer
              allowEmpty
              testId="entity-grow-up-ticks"
              onCommit={(next) => tools.setField('grow_up_ticks', next, true)}
            />
            <EventSelect
              label="On breed"
              value={value.on_breed}
              events={props.events}
              testId="entity-on-breed"
              onChange={(next) => tools.setField('on_breed', next)}
            />
          </div>
          <DefaultCheck
            label="Follows players holding its food"
            value={value.tempted}
            fallback
            testId="entity-breeding-tempted"
            onChange={(next) => tools.setField('tempted', next)}
          />
          <DefaultCheck
            label="Babies follow their parents"
            value={value.follow_parents}
            fallback
            testId="entity-breeding-follow-parents"
            onChange={(next) => tools.setField('follow_parents', next)}
          />
          <p className="text-muted text-xs">
            Empty fields use a vanilla baby’s: half size, grown up after 24000 ticks (20 minutes).
            Feeding the food to a baby makes it grow faster. A baby takes a parent’s variant.
          </p>
        </>
      ) : (
        animal && <p className="text-muted text-xs">The mob has no babies.</p>
      )}
      <FieldProblems problems={props.problems} component={BREEDABLE} keys={FIELDS} />
    </Section>
  );
}
