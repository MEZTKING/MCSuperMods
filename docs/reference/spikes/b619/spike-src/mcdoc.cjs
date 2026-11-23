// Prints an mcdoc type compactly, resolving references a few levels deep (throwaway).
const t = process.argv[2];
// run from the repository root: node mcdoc.cjs mc-26.3 '<symbol>' '<dispatcher>|<key>' ...
const s = require(require('node:path').resolve('packages/targets', t, 'vendor/vanilla-mcdoc/symbols.json'));
const m = s.mcdoc, d = s['mcdoc/dispatcher'];
const ver = (a) => (a || []).map((x) => x.name + (x.value?.value?.value ? ':' + x.value.value.value : '')).filter((x) => /since|until/.test(x)).join(',');
function fmt(ty, depth) {
  if (!ty) return '?';
  const v = ver(ty.attributes);
  const pre = v ? `[${v}]` : '';
  switch (ty.kind) {
    case 'struct': return pre + '{' + ty.fields.map((f) => f.kind === 'pair' ? `${ver(f.attributes) ? '[' + ver(f.attributes) + ']' : ''}${typeof f.key === 'string' ? f.key : '<k>'}${f.optional ? '?' : ''}: ${fmt(f.type, depth)}` : '...' + fmt(f.type, depth)).join(', ') + '}';
    case 'reference': return depth > 0 && m[ty.path] ? pre + fmt(m[ty.path], depth - 1) : pre + ty.path.split('::').pop();
    case 'union': return pre + '(' + ty.members.map((x) => fmt(x, depth)).join(' | ') + ')';
    case 'list': return pre + 'list<' + fmt(ty.item, depth) + '>';
    case 'literal': return pre + JSON.stringify(ty.value.value);
    case 'dispatcher': return pre + `dispatch(${ty.registry})`;
    case 'concrete': return pre + fmt(ty.child, depth) + '<' + ty.typeArgs.map((x) => fmt(x, depth)).join(',') + '>';
    case 'enum': return pre + 'enum(' + ty.values.map((x) => x.value).join('|') + ')';
    case 'string': return pre + 'string' + ((ty.attributes || []).find((a) => a.name === 'id') ? '#id' : '');
    default: return pre + ty.kind;
  }
}
for (const q of process.argv.slice(3)) {
  const [reg, key] = q.split('|');
  const ty = key ? d[reg]?.[key] : m[reg];
  console.log(q, '=>', fmt(ty, 2));
}
