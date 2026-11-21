package dev.mcsupermods.runtime.registry.fluid;

/**
 * Version seam (ADR 0038 D2, ADR 0099 D3): the fluid of a project fluid. 26.4 registers one {@code FlowingFluid} per
 * liquid, still and flowing together; 26.3 has two classes ({@code MsmFluid} and {@code MsmFlowingFluid}). A stub until
 * B475.
 */
public final class MsmFluid {
    private MsmFluid() {}
}
