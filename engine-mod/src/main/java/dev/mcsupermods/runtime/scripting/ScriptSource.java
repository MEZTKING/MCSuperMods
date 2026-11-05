package dev.mcsupermods.runtime.scripting;

import net.minecraft.resources.Identifier;

/** One {@code msm/<namespace>/script/<path>.js} file: id {@code <namespace>:<path>}, file name for errors. */
public record ScriptSource(String modId, Identifier id, String file, String source) {}
