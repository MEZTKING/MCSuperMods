import { describe, expect, it } from 'vitest';
import { API_VERSION, definePlugin, type Plugin, PluginDefinitionError } from '../src/index';

function plugin(overrides: Partial<Plugin> = {}): Plugin {
  return { id: 'msm.example', apiVersion: '^0.1.0', contributes: {}, ...overrides };
}

describe('definePlugin', () => {
  it('accepts a valid plugin and returns it frozen', () => {
    const input = plugin({ contributes: { commands: [{ id: 'x', title: 'X', run: () => {} }] } });
    const result = definePlugin(input);
    expect(result).toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.id).toBe('msm.example');
  });

  it.each(['Bad', '', '1x'])('rejects the id %j', (id) => {
    expect(() => definePlugin(plugin({ id }))).toThrow(PluginDefinitionError);
  });

  it('rejects an empty apiVersion', () => {
    expect(() => definePlugin(plugin({ apiVersion: '' }))).toThrow(PluginDefinitionError);
  });

  it('names its error class', () => {
    try {
      definePlugin(plugin({ id: 'Bad' }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('PluginDefinitionError');
    }
  });

  it('exposes the API version', () => {
    expect(API_VERSION).toBe('1.3.0');
  });
});
