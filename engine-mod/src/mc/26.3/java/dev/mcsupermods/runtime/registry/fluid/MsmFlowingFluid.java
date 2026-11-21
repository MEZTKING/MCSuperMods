package dev.mcsupermods.runtime.registry.fluid;

/**
 * Version seam (ADR 0038 D2, ADR 0099 D3): the flowing fluid of a project fluid on 26.3, registered as
 * {@code <ns>:flowing_<path>}. It exists on 26.3 only; 26.4's single {@code MsmFluid} covers both states. Shared code
 * never names it. A stub until B475.
 */
public final class MsmFlowingFluid {
    private MsmFlowingFluid() {}
}
