import { describe, expect, it } from 'vitest';
import { projectContextBlock, systemPrompt } from '../src/index';

describe('systemPrompt', () => {
  it.each(['chat', 'build'] as const)('is identical across calls in %s mode', (mode) => {
    expect(systemPrompt(mode)).toBe(systemPrompt(mode));
  });

  it('has no dates or times', () => {
    for (const mode of ['chat', 'build'] as const) {
      const text = systemPrompt(mode);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(text).not.toMatch(/\d{1,2}:\d{2}/);
      expect(text).not.toMatch(/\b(19|20)\d{2}\b/);
    }
  });

  it('states the rules and the build procedure', () => {
    const build = systemPrompt('build');
    expect(build).toContain('propose_plan');
    expect(build).toContain('checkpoint');
    expect(build).toContain('run_checks');
    expect(build).toContain('msm:mod');
    expect(build).toContain('British English');
    expect(systemPrompt('chat')).not.toContain('Mode: build');
  });
});

describe('projectContextBlock', () => {
  it('renders the volatile facts deterministically', () => {
    const block = projectContextBlock({
      targetId: 'mc-test',
      mcVersion: '1.0',
      namespaces: ['zeta', 'alpha'],
      kindCounts: { 'msm:item': 2, 'minecraft:recipe': 3 },
      hasModElement: false,
      pendingSummary: '',
    });
    expect(block).toBe(
      [
        '<project_context>',
        'Target: mc-test (Minecraft 1.0)',
        'Namespaces: alpha, zeta',
        'Elements per kind: minecraft:recipe: 3, msm:item: 2',
        'msm:mod element: absent',
        'Pending changes: (none)',
        '</project_context>',
      ].join('\n'),
    );
  });
});

describe('systemPrompt effects and throwables paragraph (ADR 0055 D11)', () => {
  it.each(['chat', 'build'] as const)(
    'names the kinds, the sound rule and the gaps in %s mode',
    (mode) => {
      const text = systemPrompt(mode);
      expect(text).toContain('msm:effect');
      expect(text).toContain('msm:throwable');
      expect(text).toContain('msm:on_tick');
      expect(text).toContain('run_script');
      expect(text).toContain('{ "sound_id": "namespace:event" }');
      expect(text).toContain('only vanilla sound events for now');
      expect(text).toContain('note_missing_feature');
    },
  );
});
