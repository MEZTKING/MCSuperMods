/**
 * The Entity Studio's "Variants" section (B297, ADR 0071 D4): `msm:variants` on or off, how a
 * variant is picked, and the list (id, texture picker over the project's textures, weight,
 * biome picker), with add and remove. The preview's variant switcher shows each one.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { Plus, X } from 'lucide-react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { asObject, pointerOf } from '../blocks-items/blocks-items-model';
import { ProblemsAt, TextField } from '../blocks-items/parts';
import { NumberField, SelectField } from '../structures/pickers';
import { IdList, Section } from '../worldgen/parts';
import { projectTextureIds } from './entities-model';
import { ChoiceField, componentTools, FieldProblems, numberAt } from './MobKindSection';
import {
  MAX_VARIANTS,
  type MobSectionProps,
  newVariant,
  VARIANT_CHOICE_LABELS,
  VARIANT_CHOICES,
  variantsOf,
} from './mob-kinds';

const VARIANTS = 'msm:variants';

/** The "Variants" section. */
export function VariantsSection(props: MobSectionProps) {
  const tools = componentTools(props, VARIANTS);
  const { value } = tools;
  const variants = variantsOf(props.data);
  const textures = projectTextureIds(props.project);
  const ownTexture = asObject(
    asObject(asObject(props.data).components)['msm:animated_model'],
  ).texture;
  const fallbackTexture = typeof ownTexture === 'string' ? ownTexture : '';
  const byBiome = value.choose === 'biome';
  const setVariant = (index: number, key: string, next: Json | undefined, typing = false) =>
    tools.setField(['variants', index, key], next, typing);
  return (
    <Section title="Variants" testId="entity-variants">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-variants-enabled"
          checked={tools.on}
          onChange={(event) =>
            tools.toggle(event.target.checked, () => ({
              variants: [newVariant([], fallbackTexture)],
            }))
          }
        />
        Has texture variants
      </label>
      {tools.on ? (
        <>
          <ChoiceField
            label="Picked"
            value={byBiome ? 'biome' : 'random'}
            choices={VARIANT_CHOICES}
            labels={VARIANT_CHOICE_LABELS}
            testId="entity-variants-choose"
            onChange={(next) => tools.setField('choose', next === 'random' ? undefined : next)}
          />
          <ol className="flex flex-col gap-2">
            {variants.map((raw, index) => {
              const variant = asObject(raw);
              const name = `Variant ${index + 1}`;
              const biomes = Array.isArray(variant.biomes)
                ? variant.biomes.filter((id): id is string => typeof id === 'string')
                : [];
              const pointer = tools.pointer('variants', index);
              return (
                <li
                  key={index}
                  className="flex flex-col gap-2 rounded border border-border p-2"
                  data-testid={`entity-variant-${index}`}
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <TextField
                      label={`${name} id`}
                      value={variant.id}
                      testId={`entity-variant-${index}-id`}
                      onCommit={(next) => setVariant(index, 'id', next ?? '', true)}
                    />
                    <SelectField
                      label={`${name} texture`}
                      value={
                        typeof variant.texture === 'string' && variant.texture !== ''
                          ? variant.texture
                          : undefined
                      }
                      choices={textures}
                      emptyLabel="(choose a texture)"
                      testId={`entity-variant-${index}-texture`}
                      onChange={(next) => setVariant(index, 'texture', next ?? '')}
                    />
                    <NumberField
                      label={`${name} weight`}
                      value={numberAt(variant, 'weight')}
                      integer
                      allowEmpty
                      testId={`entity-variant-${index}-weight`}
                      onCommit={(next) => setVariant(index, 'weight', next, true)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      className={iconButtonClass}
                      disabled={variants.length === 1}
                      title={
                        variants.length === 1 ? 'A mob with variants needs at least one' : undefined
                      }
                      onClick={() =>
                        tools.setField(
                          'variants',
                          variants.filter((_, at) => at !== index),
                        )
                      }
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                  {byBiome && (
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="text-muted">{name} biomes</span>
                      <IdList
                        label={`${name} biomes`}
                        ids={biomes}
                        registry="worldgen/biome"
                        suggest={props.suggest}
                        pointer={`${pointer}/biomes`}
                        problems={props.problems}
                        onChange={(next) =>
                          setVariant(index, 'biomes', next.length === 0 ? undefined : next)
                        }
                      />
                    </div>
                  )}
                  {['', 'id', 'texture', 'weight'].map((key) => (
                    <ProblemsAt
                      key={key}
                      problems={props.problems}
                      pointer={key === '' ? pointer : `${pointer}/${key}`}
                    />
                  ))}
                </li>
              );
            })}
          </ol>
          <div>
            <Button
              className="text-xs"
              data-testid="entity-add-variant"
              disabled={variants.length >= MAX_VARIANTS}
              onClick={() =>
                tools.setField('variants', [...variants, newVariant(variants, fallbackTexture)])
              }
            >
              <Plus size={12} aria-hidden />
              Add a variant
            </Button>
          </div>
          <p className="text-muted text-xs">
            {byBiome
              ? 'A mob picks among the variants listed for the biome it spawns in; variants without biomes are picked anywhere else.'
              : 'A mob picks a variant when it spawns: a variant with weight 2 comes up twice as often as one with weight 1.'}{' '}
            Only the texture changes. The id is saved with each mob, so renaming it repaints saved
            mobs as the first variant. Up to {MAX_VARIANTS} variants.
          </p>
          <ProblemsAt
            problems={props.problems}
            pointer={pointerOf(['components', VARIANTS, 'variants'])}
          />
        </>
      ) : (
        <p className="text-muted text-xs">Every mob of this type looks the same.</p>
      )}
      <FieldProblems problems={props.problems} component={VARIANTS} keys={['choose']} />
    </Section>
  );
}
