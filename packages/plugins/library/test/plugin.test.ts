import { describe, expect, it } from 'vitest';
import plugin, { libraryExamples, libraryStarters } from '../src/index';

describe('@msm/plugin-library', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.library');
    expect(plugin.apiVersion).toBe('^0.6.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes starters and examples but no element kinds or templates', () => {
    expect(plugin.contributes.elementKinds).toBeUndefined();
    expect(plugin.contributes.elementTemplates).toBeUndefined();
    expect(plugin.contributes.projectStarters).toEqual([...libraryStarters]);
    expect(plugin.contributes.examples).toEqual([...libraryExamples]);
  });
});
