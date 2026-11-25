"""B840 T1 and T2: rough counts over app/src/renderer/src (tests excluded).

python3 -I docs/reference/spikes/b840/scripts/t1-t2-counts.py app/src/renderer/src > out.json

T1: colours a theme of the eight tokens will not reach: Tailwind palette and arbitrary colour
classes (`bg-red-500`, `text-[#ff5555]`, `bg-black/60`, `text-white`), colour literals in code
(`#rgb`, `#rrggbb`, `rgb(`, `hsl(`) and the files that draw on a canvas or WebGL (their colours
are the scene's, not the UI's). Token classes (`bg-panel`, `text-muted`, `border-border`,
`text-accent`, `text-error`, `text-warning`, `bg-bg`, `text-text`) and `var(--color-...)` are
the reachable ones.

T2: user-visible string literals: JSX text nodes, and string values of the props people read
(`label`, `title`, `placeholder`, `aria-label`, `description`, `emptyLabel`, `alt`, `message`,
`tooltip`, `hint`, `heading`, `summary`), plus template literals in those props. Rough: it
counts each literal once per place, not unique sentences.
"""
import json
import os
import re
import sys

root = sys.argv[1]
TOKENS = {'bg', 'panel', 'border', 'text', 'muted', 'accent', 'error', 'warning', 'transparent', 'current', 'inherit'}
PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white'
UTIL = r'(?:bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|divide|shadow|accent|caret|placeholder)'
palette_class = re.compile(r'(?<![\w-])' + UTIL + r'-(?:' + PALETTE + r')(?:-\d{2,3})?(?:/\d{1,3})?(?![\w-])')
arbitrary_class = re.compile(r'(?<![\w-])' + UTIL + r'-\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]*\)|hsla?\([^\]]*\))\]')
token_class = re.compile(r'(?<![\w-])' + UTIL + r'-(' + '|'.join(TOKENS) + r')(?:/\d{1,3})?(?![\w-])')
hex_lit = re.compile(r"['\"`]#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})['\"`]")
fn_lit = re.compile(r"\b(?:rgba?|hsla?)\(")
canvas = re.compile(r"getContext\(\s*['\"](?:2d|webgl2?|bitmaprenderer)['\"]|new THREE\.|WebGL2RenderingContext|fillStyle|strokeStyle")
jsx_text = re.compile(r">\s*([A-Z][^<>{}\n]{2,}?)\s*<")
prop_str = re.compile(r"\b(label|title|placeholder|aria-label|description|emptyLabel|alt|message|tooltip|hint|heading|summary)=\{?\s*(['\"`])((?:(?!\2).){3,}?)\2")
obj_str = re.compile(r"\b(label|title|placeholder|description|message|hint|heading|summary|text|sentence|words)\s*:\s*(['\"`])((?:(?!\2).){3,}?)\2")

t1 = {'paletteClasses': 0, 'arbitraryColourClasses': 0, 'tokenClasses': 0, 'hexLiterals': 0, 'colourFunctions': 0, 'files': 0,
      'filesWithUnreachedColours': 0, 'canvasOrWebglFiles': 0, 'cssVarTokenUses': 0}
by_folder = {}
t2 = {'jsxText': 0, 'propStrings': 0, 'objectStrings': 0, 'files': 0}
examples = {'palette': [], 'arbitrary': [], 'hex': []}
for dirpath, _, names in os.walk(root):
    for name in names:
        if not name.endswith(('.ts', '.tsx', '.css')) or '.test.' in name:
            continue
        path = os.path.join(dirpath, name)
        src = open(path, encoding='utf-8').read()
        rel = os.path.relpath(path, root)
        folder = rel.split(os.sep)[0] if os.sep in rel else '(root)'
        t1['files'] += 1
        p = palette_class.findall(src)
        a = arbitrary_class.findall(src)
        k = token_class.findall(src)
        h = hex_lit.findall(src)
        f = fn_lit.findall(src)
        t1['paletteClasses'] += len(p)
        t1['arbitraryColourClasses'] += len(a)
        t1['tokenClasses'] += len(k)
        t1['hexLiterals'] += len(h)
        t1['colourFunctions'] += len(f)
        t1['cssVarTokenUses'] += src.count('var(--color-')
        unreached = len(p) + len(a) + len(h) + len(f)
        if unreached:
            t1['filesWithUnreachedColours'] += 1
            by_folder[folder] = by_folder.get(folder, 0) + unreached
        if canvas.search(src):
            t1['canvasOrWebglFiles'] += 1
        for lst, found in (('palette', p), ('arbitrary', a), ('hex', h)):
            if found and len(examples[lst]) < 6:
                examples[lst].append(f'{rel}: {found[0]}')
        if name.endswith('.tsx') or name.endswith('.ts'):
            j = [m for m in jsx_text.findall(src) if re.search(r'[a-z]', m)] if name.endswith('.tsx') else []
            ps = prop_str.findall(src)
            os_ = [m for m in obj_str.findall(src) if ' ' in m[2] and re.match(r'[A-Z]', m[2])]
            if j or ps or os_:
                t2['files'] += 1
            t2['jsxText'] += len(j)
            t2['propStrings'] += len(ps)
            t2['objectStrings'] += len(os_)
t2['total'] = t2['jsxText'] + t2['propStrings'] + t2['objectStrings']
print(json.dumps({'t1': t1, 't1ByFolder': dict(sorted(by_folder.items(), key=lambda x: -x[1])), 't1Examples': examples, 't2': t2}, indent=1))
