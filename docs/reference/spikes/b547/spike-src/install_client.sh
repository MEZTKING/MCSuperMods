#!/bin/bash
# B547 spike: put the spike's data, lang and project command into the gametest mod's resources (temporary).
set -e
V=$1
B=<scratchpad>/b547
RES=<scratchpad>/wt-B547/engine-mod/src/gametest/resources
rm -rf $B/packs/$V/main && python3 $B/spike-src/make_pack.py $V $B/packs/$V/main > /dev/null
rm -rf $RES/data/b547 $RES/data/minecraft/tags/function $RES/data/minecraft/tags/worldgen $RES/assets/b547 $RES/msm/b547
cp -r $B/packs/$V/main/data/b547 $RES/data/b547
mkdir -p $RES/data/minecraft/tags
cp -r $B/packs/$V/main/data/minecraft/tags/function $RES/data/minecraft/tags/function
cp -r $B/packs/$V/main/data/minecraft/tags/worldgen $RES/data/minecraft/tags/worldgen
mkdir -p $RES/assets/b547/lang $RES/msm/b547/command
echo '{"generator.b547.void": "B547 Empty sky", "generator.b547.void_plain": "B547 Empty sky (plain)"}' > $RES/assets/b547/lang/en_us.json
cat > $RES/msm/b547/command/signal.json <<'J'
{
  "arguments": [{"name": "id", "type": "word"}],
  "event": "b547:sig",
  "events": {"b547:sig": {"actions": [{"function": "b547:bridge/heard", "type": "run_function"}]}},
  "format": 1,
  "name": "b547_signal",
  "permission": 2
}
J
echo installed $V
