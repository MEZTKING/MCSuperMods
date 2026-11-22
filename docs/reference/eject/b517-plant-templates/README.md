# Plant templates of the Java eject (B517)

The scripts B517 used to turn the runtime's plant classes (`engine-mod/src/main/java/dev/mcsupermods/runtime/registry/types/Msm*Plant*.java`, bamboo, multiface and dripleaf) into the eject's `block/type/Mod*` templates in `packages/targets/mc-26.3/src/java-project/templates/growing-plants-java.ts`, with the behaviour driver taken out. `plantdiffs.json` lists the replacements per class; `plants-and-storage.test.ts` checks the templates line by line against the runtime (`stripDriver`, `PLANT_DIFFERENCES`).

When a runtime plant class changes, the line-by-line test fails; regenerate the templates with these scripts (run from the scratch folder they expect: `gen-plants.py` then `gen-plants-ts.py`, adjusting the `b517tools` paths) or edit the template and `PLANT_DIFFERENCES` by hand. They are kept for reference only: not built, linted or run by CI.
