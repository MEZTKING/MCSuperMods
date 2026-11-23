# Probe: why a use-on-block from a stand-in player answers "height limit" (the hit position check).
import sys, srv
v = sys.argv[1]
s = srv.Server(v, packs={'b720': f'{srv.S}/packs/{v}/b720'})
for c in ['gamerule spawn_monsters false', 'b720 join Ann', 'tp Ann 50 -60 50', 'item replace entity Ann weapon.mainhand with minecraft:oak_planks',
          'b720 useon Ann 51 -61 51', 'tp Ann 50 -60 50 0 60', 'b720 useon Ann 51 -61 51', 'tp Ann 51.5 -60 49.5 0 60', 'b720 useon Ann 51 -61 51',
          'setblock 51 64 51 minecraft:stone', 'tp Ann 50 65 50', 'b720 useon Ann 51 64 51', 'data get entity Ann Pos']:
    print(c, [l for l in s.cmd(c) if 'Saving' not in l])
s.stop()
