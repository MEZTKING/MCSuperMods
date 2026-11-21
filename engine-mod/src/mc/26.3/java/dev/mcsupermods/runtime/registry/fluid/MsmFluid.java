package dev.mcsupermods.runtime.registry.fluid;

/**
 * Version seam (ADR 0038 D2, ADR 0099 D3): the still (source) fluid of a project fluid. 26.3 registers two fluids per
 * liquid, this one as {@code <id>} and {@link MsmFlowingFluid} as {@code <ns>:flowing_<path>}; 26.4 has one class,
 * {@code MsmFluid}, for both. A stub until B475.
 */
public final class MsmFluid {
    private MsmFluid() {}
}
