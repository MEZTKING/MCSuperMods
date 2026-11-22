/**
 * The Mob Studio's "Shoulder" section (ADR 0098 D4 as amended after the spike, ADR 0101 D1):
 * `msm:shoulder_riding` on or off, with what the pet needs (an animal that can be tamed, no
 * wider than 0.7 blocks) said in words next to the switch, and which shoulder it takes (ADR 0109
 * D2: the left, the right or whichever is free, as the player sees it).
 *
 * @packageDocumentation
 */

import { SHOULDER_COMPONENT, SHOULDER_MAX_WIDTH } from '@msm/plugin-entities';
import { asObject } from '../blocks-items/blocks-items-model';
import { Section } from '../worldgen/parts';
import { ChoiceField, componentTools, FieldProblems } from './MobKindSection';
import { baseOf, type MobSectionProps } from './mob-kinds';

/** What a mob still lacks to sit on a shoulder, in words; empty when it can. */
export function shoulderNeeds(data: MobSectionProps['data']): string[] {
  const object = asObject(data);
  const needs: string[] = [];
  if (baseOf(data) !== 'animal') needs.push('It must be an animal (Pet under Kind of mob).');
  if (asObject(object.components)['msm:tameable'] === undefined) {
    needs.push('It must be tameable (switch on Taming).');
  }
  const width = asObject(object.size).width;
  if (typeof width === 'number' && width > SHOULDER_MAX_WIDTH) {
    needs.push(`It is ${width} blocks wide; a shoulder pet is at most ${SHOULDER_MAX_WIDTH}.`);
  }
  return needs;
}

/** The shoulder sides of `msm:shoulder_riding.sides` (ADR 0109 D2), in the picker's order. */
export const SHOULDER_SIDE_CHOICES: readonly string[] = Object.freeze(['either', 'left', 'right']);

/** Each side in plain words, as the player sees it. */
export const SHOULDER_SIDE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  either: 'Whichever is free (the right first)',
  left: 'The left shoulder',
  right: 'The right shoulder',
});

/** The "Shoulder" section. */
export function ShoulderSection(props: MobSectionProps) {
  const tools = componentTools(props, SHOULDER_COMPONENT);
  const needs = tools.on ? shoulderNeeds(props.data) : [];
  return (
    <Section title="Shoulder" testId="entity-shoulder">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-shoulder-on"
          checked={tools.on}
          onChange={(event) => tools.toggle(event.target.checked, () => ({}))}
        />
        Rides on its owner's shoulder
      </label>
      {tools.on && (
        <>
          <p className="text-muted text-xs" data-testid="entity-shoulder-how">
            The tamed pet jumps onto its owner's shoulder when the owner stands near it. It jumps
            down when the owner is hurt, sneaks, sleeps, rides, swims or flies, and waits five
            seconds before jumping up again. A player carries two pets at most, one on each
            shoulder; parrots keep their own shoulders.
          </p>
          <ChoiceField
            label="Shoulder"
            value={typeof tools.value.sides === 'string' ? tools.value.sides : 'either'}
            choices={SHOULDER_SIDE_CHOICES}
            labels={SHOULDER_SIDE_LABELS}
            testId="entity-shoulder-side"
            onChange={(next) => tools.setField('sides', next === 'either' ? undefined : next)}
          />
          {needs.length > 0 && (
            <ul className="text-warning text-xs" data-testid="entity-shoulder-needs">
              {needs.map((need) => (
                <li key={need}>{need}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <FieldProblems problems={props.problems} component={SHOULDER_COMPONENT} keys={['sides']} />
    </Section>
  );
}
