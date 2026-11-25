#!/usr/bin/env bash
# B810 V2: which upstreams exist for the newest Minecraft versions, and how far each lags.
# Usage: v2-upstream.sh <work folder> <results folder>. Public reads only; generic client name.
set -euo pipefail
WORK=$1; OUT=$(realpath -m "$2")
UA="MCSuperMods-spike (github.com/MEZTKING/MCSuperMods)"
mkdir -p "$WORK" "$OUT"
cd "$WORK"
curl -sS -A "$UA" https://piston-meta.mojang.com/mc/game/version_manifest_v2.json -o manifest.json
# mcmeta: summary and registries tags, and each tag's commit date (tree-less fetch).
git ls-remote --tags https://github.com/misode/mcmeta > mcmeta-tags.txt
if [ ! -d mcmeta.git ]; then git init -q --bare mcmeta.git; fi
for v in 26.3 26.4-snapshot-5 26.4-snapshot-6 26.4-snapshot-7 26.4-snapshot-8 26.4-snapshot-9 26.4-snapshot-10 26.4-pre-1 26.3-rc-3 26.3-pre-1; do
  for kind in summary registries data assets; do
    t="$v-$kind"
    if grep -q "refs/tags/$t\$" mcmeta-tags.txt; then
      git -C mcmeta.git fetch -q --depth=1 --filter=tree:0 https://github.com/misode/mcmeta "refs/tags/$t:refs/tags/$t" 2>/dev/null || true
      d=$(git -C mcmeta.git log -1 --format=%cI "refs/tags/$t" 2>/dev/null || echo "?")
      echo -e "$v\t$kind\t$d"
    else
      echo -e "$v\t$kind\tmissing"
    fi
  done
done > "$OUT/v2-mcmeta-tags.tsv"
# vanilla-mcdoc: history of main and the generated branch (blob-less clone).
if [ ! -d vanilla-mcdoc ]; then git clone -q --filter=blob:none --no-checkout https://github.com/SpyglassMC/vanilla-mcdoc vanilla-mcdoc; fi
git -C vanilla-mcdoc fetch -q origin generated:refs/remotes/origin/generated || true
git -C vanilla-mcdoc log origin/main --since=2026-08-01 --format='%h%x09%cI%x09%s' > "$OUT/v2-vanilla-mcdoc-main.tsv"
git -C vanilla-mcdoc log origin/generated --since=2026-10-25 --format='%h%x09%cI%x09%s' | head -60 > "$OUT/v2-vanilla-mcdoc-generated.tsv"
# Fabric meta: game versions known and loaders for the newest.
curl -sS -A "$UA" https://meta.fabricmc.net/v2/versions/game -o fabric-game.json
curl -sS -A "$UA" https://meta.fabricmc.net/v2/versions/loader -o fabric-loader.json
for v in 26.4-pre-1 26.4-snapshot-10 26.4; do
  code=$(curl -sS -A "$UA" -o "fabric-loader-$v.json" -w '%{http_code}' "https://meta.fabricmc.net/v2/versions/loader/$v")
  echo -e "$v\t$code\t$(node -e "try{const a=require('./fabric-loader-$v.json');console.log(a.length, a[0]?.loader?.version)}catch(e){console.log('none')}")"
done > "$OUT/v2-fabric-loader.tsv"
# Loom: newest release and pre-release.
curl -sS -A "$UA" https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml -o loom.xml
# Modrinth: Fabric API and GeckoLib versions, with game versions and dates.
curl -sS -A "$UA" 'https://api.modrinth.com/v2/project/fabric-api/version?loaders=%5B%22fabric%22%5D' -o modrinth-fabric-api.json
curl -sS -A "$UA" 'https://api.modrinth.com/v2/project/geckolib/version?loaders=%5B%22fabric%22%5D' -o modrinth-geckolib.json
echo done
