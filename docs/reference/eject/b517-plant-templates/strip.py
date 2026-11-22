"""Strip the runtime's behaviour driver from a runtime block class (B517). Usage: strip.py in.java > out.java"""
import sys, re
src = open(sys.argv[1]).read()
src = re.sub(r'^import dev\.mcsupermods\.[^\n]*\n', '', src, flags=re.M)
src = src.replace(' implements DrivenBlock', '').replace(', DrivenBlock', '')
for pat in [
    r'^\s*(private )?final BlockBehaviourDriver driver;\n',
    r'^\s*this\.driver = new BlockBehaviourDriver\(id, definition\);\n',
    r'^\s*InteractionResult own = driver\.useWithoutItem\(level, pos, player\);\n',
    r'^\s*(rules\.)?driver\.(stepOn|playerWillDestroy|setPlacedBy|entityInside|animateTick|useWithoutItem)\([^\n]*\);\n',
    r'^\s*if \(level\.getBlockState\(pos\)\.is\(this\)\) \{\n\s*(rules\.)?driver\.randomTick\(level, pos, random\);\n\s*\}\n',
    r'^\s*// Events and triggers: delegated[^\n]*\n\n',
]:
    src = re.sub(pat, '', src, flags=re.M)
src = src.replace(' || rules.driver.definition().components().onRandomTick().isPresent()', '')
src = src.replace(' || driver.definition().components().onRandomTick().isPresent()', '')
src = src.replace('return picked.consumesAction() ? picked : own;', 'return picked;')
src = src.replace('return vanilla.consumesAction() ? vanilla : own;', 'return vanilla;')
# Methods: split into chunks starting at annotations/doc comments, drop pass-through ones.
lines = src.split('\n')
out = []
i = 0
def method_end(start):
    depth = 0; seen = False
    for j in range(start, len(lines)):
        depth += lines[j].count('{') - lines[j].count('}')
        if '{' in lines[j]: seen = True
        if seen and depth == 0: return j
    return len(lines) - 1
while i < len(lines):
    l = lines[i]
    # a member block: optional javadoc, @Override, signature
    j = i
    if re.match(r'^\s*/\*\*', l):
        k = i
        while '*/' not in lines[k]: k += 1
        j = k + 1
    if j < len(lines) and lines[j].strip() == '@Override':
        sig = j + 1
        end = method_end(sig)
        body = [x.strip() for x in lines[sig:end + 1]]
        text = ' '.join(body)
        inner = text[text.index('{') + 1: text.rindex('}')].strip()
        name = re.search(r'(\w+)\(', lines[sig]).group(1)
        passthrough = (re.fullmatch(r'(return )?super\.\w+\([^;]*\);', inner) is not None) or name == 'driver'
        vanilla_only = re.fullmatch(r'InteractionResult vanilla = super\.useWithoutItem\([^;]*\); return vanilla;', inner) is not None
        if passthrough or vanilla_only:
            i = end + 1
            if i < len(lines) and lines[i].strip() == '' and out and out[-1].strip() == '':
                i += 1
            continue
    out.append(l)
    i += 1
src = '\n'.join(out)
src = re.sub(r'\n\n\n+', '\n\n', src)
src = re.sub(r'\n\n(\s*\})', r'\n\1', src)
print(src, end='')
