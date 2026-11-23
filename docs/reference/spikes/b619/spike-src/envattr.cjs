// Summarises each environment attribute's value type and the timeline track shape (throwaway).
const t = process.argv[2];
const s = require(require('node:path').resolve('packages/targets', t, 'vendor/vanilla-mcdoc/symbols.json'));
const m = s.mcdoc, d = s['mcdoc/dispatcher'];
const short = (ty, depth = 0) => {
  if (!ty) return '?';
  if (ty.kind === 'reference') return depth < 2 && m[ty.path] ? short(m[ty.path], depth + 1) : ty.path.split('::').pop();
  if (ty.kind === 'struct') return '{' + ty.fields.map((f) => (typeof f.key === 'string' ? f.key : '<k>') + ':' + short(f.type, depth + 1)).join(',') + '}';
  if (ty.kind === 'union') return '(' + ty.members.map((x) => short(x, depth + 1)).join('|') + ')';
  if (ty.kind === 'list') return 'list<' + short(ty.item, depth + 1) + '>';
  if (ty.kind === 'enum') return 'enum[' + ty.values.length + ']';
  if (ty.kind === 'string') return (ty.attributes || []).find((a) => a.name === 'id') ? 'id' : 'string';
  if (ty.kind === 'concrete') return short(ty.child, depth) + '<' + ty.typeArgs.map((x) => short(x, depth + 1)).join(',') + '>';
  if (ty.kind === 'dispatcher') return 'dispatch(' + ty.registry + ')';
  return ty.kind;
};
const out = {};
for (const [k, v] of Object.entries(d['minecraft:environment_attribute'])) out[k] = short(v).slice(0, 160);
console.log(JSON.stringify(out, null, 1));
console.log('Timeline:', short(m['::java::data::timeline::Timeline']).slice(0, 600));
console.log('anon0:', short(m['::java::data::timeline::<anonymous 0>']).slice(0, 600));
