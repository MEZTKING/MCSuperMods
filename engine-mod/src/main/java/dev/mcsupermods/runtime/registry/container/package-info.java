/**
 * Blocks with block entities (ADR 0074 D2, ADR 0075 D3): {@link dev.mcsupermods.runtime.registry.container.MsmContainerBlock},
 * the {@code MsmBlock} subclass that implements {@code EntityBlock}, and
 * {@link dev.mcsupermods.runtime.registry.container.BlockEntityHooks}, which decides which definitions get one and registers
 * their block entity types right after each block. B312 prepared the seams with no behaviour; containers (B314) and
 * machines (B316) fill them.
 */
package dev.mcsupermods.runtime.registry.container;
