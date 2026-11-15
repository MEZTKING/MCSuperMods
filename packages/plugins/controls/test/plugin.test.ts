import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-controls', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.controls');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes the two kinds, six templates and three validators', () => {
    expect(plugin.contributes.elementKinds?.map((kind) => [kind.id, kind.folder])).toEqual([
      ['msm:key_bind', 'key_bind'],
      ['msm:hud', 'hud'],
    ]);
    expect(plugin.contributes.elementTemplates).toHaveLength(6);
    expect(plugin.contributes.validators).toHaveLength(3);
    for (const kind of plugin.contributes.elementKinds ?? []) {
      expect(kind.registry, kind.id).toBeUndefined();
      expect(kind.hiddenPaths, kind.id).toEqual(['/format']);
    }
  });
});
