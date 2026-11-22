import re, subprocess, sys, json
RT='wt-B517/engine-mod/src/main/java/dev/mcsupermods/runtime/registry/types/'
RENAMES=[
 [r'\bMsm(GrowingPlantHead|GrowingPlantBody|ColumnPlant|Bamboo|BambooShoot|Multiface|BigDripleaf|DripleafStem|SmallDripleaf|FlowerPot)Block\b', r'Mod\1Block'],
 [r'\bGrowingPlantFields\.', 'PlantSpec.'],
 [r'\bGrowingPlantTypes\.', 'PlantSpec.'],
 [r'\bBlockType\.IdOrTag\b', 'PlantSpec.IdOrTag'],
]
def conv(name):
    s=subprocess.run(['python3','b517tools/strip.py',RT+name+'.java'],capture_output=True,text=True,check=True).stdout
    for a,b in RENAMES: s=re.sub(a,b,s)
    return s
if __name__=='__main__':
    print(conv(sys.argv[1]))
