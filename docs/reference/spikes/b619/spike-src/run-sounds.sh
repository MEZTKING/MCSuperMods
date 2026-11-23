#!/bin/bash
# B619 spike (throwaway): 3S2 decode of every vanilla sound in Electron, both targets, then the long-file stream test.
cd "$(dirname "$0")/.."
E=/home/user/MCSuperMods/node_modules/.pnpm/electron@45.2.2_supports-color@7.2.0/node_modules/electron/dist/electron
A=~/.gradle/caches/fabric-loom/assets
F="--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader"
xvfb-run -a $E $F src/electron/main.cjs -- sounds results/3s2-decode-26.3.json $A/indexes/26.3-34.json $A/objects
xvfb-run -a $E $F src/electron/main.cjs -- sounds results/3s2-decode-26.4.json $A/indexes/26.4-snapshot-7-36.json $A/objects
xvfb-run -a $E $F src/electron/main.cjs -- stream results/3s2-stream-26.3.json $A/indexes/26.3-34.json $A/objects minecraft/sounds/music/game/end/the_end.ogg
xvfb-run -a $E $F src/electron/main.cjs -- stream results/3s2-stream-disc-26.3.json $A/indexes/26.3-34.json $A/objects minecraft/sounds/records/pigstep.ogg
