package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;

/** A block made from an {@code msm/<ns>/block/*.json} definition, whatever vanilla class it extends (ADR 0067 D4). */
public interface DrivenBlock {
    /** The shared events, triggers and light of the definition. */
    BlockBehaviourDriver driver();
}
