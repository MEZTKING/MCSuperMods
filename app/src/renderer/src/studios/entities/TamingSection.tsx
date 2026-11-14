/**
 * The Entity Studio's "Taming" section (B297, ADR 0071 D1): `msm:tameable` on or off, the
 * taming items, chance, sitting, following and defending the owner, the follow distances,
 * the tamed health and the on-tame event. Needs base `animal`.
 *
 * @packageDocumentation
 */

import { asObject } from '../blocks-items/blocks-items-model';
import { EventSelect } from '../blocks-items/parts';
import { NumberField } from '../structures/pickers';
import { IdList, Section } from '../worldgen/parts';
import { componentTools, DefaultCheck, FieldProblems, numberAt } from './MobKindSection';
import { baseOf, type MobSectionProps, newTameable } from './mob-kinds';

const TAMEABLE = 'msm:tameable';
const FIELDS = [
  'items',
  'chance',
  'sit',
  'follows_owner',
  'follow',
  'defends_owner',
  'tamed_health',
  'on_tame',
] as const;

/** The note shown when an animal-only component is on a mob of another base. */
export const NEEDS_ANIMAL_NOTE =
  'Needs the base "Animal": pick Pet or Farm animal under Kind of mob, or the game leaves it out.';

/** The "Taming" section. */
export function TamingSection(props: MobSectionProps) {
  const tools = componentTools(props, TAMEABLE);
  const { value } = tools;
  const items = Array.isArray(value.items)
    ? value.items.filter((id): id is string => typeof id === 'string')
    : [];
  const follow = asObject(value.follow);
  const animal = baseOf(props.data) === 'animal';
  const followsOwner = value.follows_owner !== false;
  /** Sets one follow field; removes `follow` when nothing is left. */
  const setFollow = (key: string, next: number | undefined) => {
    const rest = { ...follow };
    if (next === undefined) delete rest[key];
    else rest[key] = next;
    if (Object.keys(rest).length === 0) tools.setField('follow', undefined);
    else tools.setField(['follow', key], next, true);
  };
  return (
    <Section title="Taming" testId="entity-taming">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-tameable"
          checked={tools.on}
          onChange={(event) => tools.toggle(event.target.checked, newTameable)}
        />
        Can be tamed
      </label>
      {!animal && (
        <p className="text-muted text-xs" data-testid="entity-taming-needs-animal">
          {NEEDS_ANIMAL_NOTE}
        </p>
      )}
      {tools.on ? (
        <>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">Taming food</span>
            <IdList
              label="Taming food"
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
              label="Chance per item"
              value={numberAt(value, 'chance')}
              allowEmpty
              testId="entity-taming-chance"
              onCommit={(next) => tools.setField('chance', next, true)}
            />
            <NumberField
              label="Health once tamed"
              value={numberAt(value, 'tamed_health')}
              allowEmpty
              testId="entity-tamed-health"
              onCommit={(next) => tools.setField('tamed_health', next, true)}
            />
            <EventSelect
              label="On tame"
              value={value.on_tame}
              events={props.events}
              testId="entity-on-tame"
              onChange={(next) => tools.setField('on_tame', next)}
            />
          </div>
          <DefaultCheck
            label="Sits when told (owner’s right click)"
            value={value.sit}
            fallback
            testId="entity-taming-sit"
            onChange={(next) => tools.setField('sit', next)}
          />
          <DefaultCheck
            label="Follows its owner"
            value={value.follows_owner}
            fallback
            testId="entity-taming-follows"
            onChange={(next) => tools.setField('follows_owner', next)}
          />
          {followsOwner && (
            <div className="flex flex-wrap items-end gap-2">
              <NumberField
                label="Follow speed"
                value={numberAt(follow, 'speed')}
                allowEmpty
                testId="entity-follow-speed"
                onCommit={(next) => setFollow('speed', next)}
              />
              <NumberField
                label="Starts following at"
                value={numberAt(follow, 'start_distance')}
                allowEmpty
                testId="entity-follow-start"
                onCommit={(next) => setFollow('start_distance', next)}
              />
              <NumberField
                label="Stops at"
                value={numberAt(follow, 'stop_distance')}
                allowEmpty
                testId="entity-follow-stop"
                onCommit={(next) => setFollow('stop_distance', next)}
              />
            </div>
          )}
          <DefaultCheck
            label="Defends its owner"
            value={value.defends_owner}
            fallback
            testId="entity-taming-defends"
            onChange={(next) => tools.setField('defends_owner', next)}
          />
          <p className="text-muted text-xs">
            Empty fields use a wolf’s: chance 0.33, follow speed 1, starts at 10 blocks, stops at 2.
            A tamed mob keeps its health unless “Health once tamed” is set. With Riding, the owner
            sits it by sneaking.
          </p>
        </>
      ) : (
        animal && <p className="text-muted text-xs">The mob cannot be tamed.</p>
      )}
      <FieldProblems problems={props.problems} component={TAMEABLE} keys={FIELDS} />
    </Section>
  );
}
