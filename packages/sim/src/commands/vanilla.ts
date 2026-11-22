/**
 * The game's own commands that Try it can honour (ADR 0120 D8; B601 stub, B606 fills it). The
 * list is B600's: `give`, `clear`, `setblock`, `fill`, `clone`, `summon`, `kill`, `tp`, `effect`,
 * `say`, `tellraw`, `title`, `playsound`, `particle`, `time`, `function`, `schedule`,
 * `scoreboard`, `tag`, `return`, `execute` and macro lines. Every other command is said out loud
 * through `SimLog.onlyInMinecraft`.
 */

/** The command names Try it runs. Stub: none until B606. */
export const VANILLA_COMMANDS: readonly string[] = [];

/** Whether Try it runs this line (the Function editor's gutter, B606). Stub: no. */
export function understands(_line: string): boolean {
  return false;
}
