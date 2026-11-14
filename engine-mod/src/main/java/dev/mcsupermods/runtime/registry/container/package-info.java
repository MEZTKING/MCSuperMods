/**
 * Blocks with block entities (ADR 0074 D2, ADR 0075 D3): {@link dev.mcsupermods.runtime.registry.container.MsmContainerBlock},
 * the {@code MsmBlock} subclass that implements {@code EntityBlock}, and
 * {@link dev.mcsupermods.runtime.registry.container.BlockEntityHooks}, which decides which definitions get one and registers
 * their block entity types right after each block. Containers (B314, ADR 0074): {@code MsmStorageBlockEntity},
 * {@code ContainerMenus} (vanilla menus per layout), {@code ContainerOpeners} (the {@code open} property and sounds),
 * {@code HolderInteraction} (the {@code none} layout) and {@code MsmContainerBlockItem} (keep-contents). Machines (B316)
 * add their branches.
 */
package dev.mcsupermods.runtime.registry.container;
