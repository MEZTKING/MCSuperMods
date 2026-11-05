/**
 * The `msm:mod` template: one per project, named `mod`, its mod id derived from the
 * namespace.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { MOD_KIND } from '../kinds';
import { displayName } from './shared';

/**
 * A Fabric mod id (`^[a-z][a-z0-9_-]{1,63}$`) from a namespace: other characters become `_`, a
 * leading non-letter gets an `mod_` prefix, and the result is cut to 64 characters.
 */
export function modIdFromNamespace(namespace: string): string {
  let id = namespace.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!/^[a-z]/.test(id)) id = `mod_${id}`;
  if (id.length < 2) id = `${id}_mod`;
  return id.slice(0, 64);
}

export const modTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_mod',
    kind: MOD_KIND,
    category: 'Mod',
    title: 'Mod metadata',
    description: 'The name, version and licence of the Fabric mod; one per project.',
    defaultName: 'mod',
    fixedName: true,
    data: (context) => ({
      mod_id: modIdFromNamespace(context.namespace),
      version: '1.0.0',
      name: displayName(context.namespace),
      description: '',
      authors: [],
      licence: 'All-Rights-Reserved',
    }),
  },
];
