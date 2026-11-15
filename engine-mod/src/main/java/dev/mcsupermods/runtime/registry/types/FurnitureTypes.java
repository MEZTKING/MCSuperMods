package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.types.FurnitureFields;
import java.util.Optional;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.object.builder.v1.block.type.WoodTypeBuilder;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.properties.WoodType;
import net.minecraft.world.level.material.PushReaction;

/**
 * The block classes of the furniture, light and sign types {@code bed}, {@code ladder}, {@code torch}, {@code lantern},
 * {@code chain}, {@code rod}, {@code sign}, {@code hanging_sign}, {@code stem} and {@code scaffolding} (ADR 0094 D1 to
 * D6). Each extends the vanilla class of the plan's fact table (F1, F5–F8, F13) and delegates events, triggers and ambient
 * particles to the {@code BlockBehaviourDriver}. The vanilla {@code Properties} the family adds on top of the definition's
 * strength, sound and tool (as {@code BlockTypes.properties} does for the older types; observed behaviour, not copied
 * code):
 * <ul>
 *   <li>{@code bed}: {@code noOcclusion}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code ladder}: {@code forceSolidOff}, {@code noOcclusion}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code torch}: {@code noCollision}, {@code pushReaction(POPPED)}, light 14</li>
 *   <li>{@code lantern}: {@code forceSolidOn}, {@code noOcclusion}, {@code pushReaction(POPPED)}, light 15</li>
 *   <li>{@code chain}: {@code forceSolidOn}, {@code noOcclusion}</li>
 *   <li>{@code rod}: {@code forceSolidOff}, {@code noOcclusion}, light 14</li>
 *   <li>{@code sign}, {@code hanging_sign}: {@code forceSolidOn}, {@code noCollision}</li>
 *   <li>{@code stem}: {@code noCollision}, {@code randomTicks}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code scaffolding}: {@code noCollision} (its own collision shape lets entities stand on it), {@code dynamicShape},
 *       never a valid spawn or a redstone conductor, {@code pushReaction(POPPED)}</li>
 * </ul>
 * {@code msm:light_emitter} replaces the default light of the torch, lantern and rod. Companions ({@code <path>_wall},
 * {@code <path>_attached}) are made and registered by {@link Companions} right after their element, with a full copy of
 * these properties.
 */
public final class FurnitureTypes {
    private FurnitureTypes() {}

    /** Vanilla torch light (ADR 0094 D4). */
    public static final int TORCH_LIGHT = 14;
    /** Vanilla lantern light (ADR 0094 D4). */
    public static final int LANTERN_LIGHT = 15;
    /** Vanilla end rod light (ADR 0094 D4). */
    public static final int ROD_LIGHT = 14;

    /**
     * The block for a definition of one of the ten types; called from {@link BlockTypes#create}.
     *
     * @param warn takes a load warning (without the file name)
     * @throws IllegalArgumentException when the companion's generated id is already a registered block (ADR 0094 D3: the
     *     element is skipped; the registrar reports a load error for the file)
     */
    public static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        Companions.companionId(id, definition.type()).ifPresent(companion -> {
            if (BuiltInRegistries.BLOCK.containsKey(companion)) {
                throw new IllegalArgumentException("the generated block " + companion + " (the " + Companions.kind(definition.type())
                        + " form) is already registered; the " + definition.type().id() + " is skipped");
            }
        });
        boolean ownLight = definition.components().lightEmitter().isPresent();
        return switch (definition.type()) {
            case BED -> {
                FurnitureFields.Bed bed = (FurnitureFields.Bed) definition.typeFields();
                yield new MsmBedBlock(id, definition, DyeColor.byName(bed.colour().id(), DyeColor.WHITE),
                        bed.rule() == FurnitureFields.BedRule.STRAW_BED, props.noOcclusion().pushReaction(PushReaction.POPPED));
            }
            case LADDER -> new MsmLadderBlock(id, definition, props.forceSolidOff().noOcclusion().pushReaction(PushReaction.POPPED));
            case TORCH -> new MsmTorchBlock(id, definition, particle(definition, warn),
                    light(props.noCollision().pushReaction(PushReaction.POPPED), ownLight, TORCH_LIGHT));
            case LANTERN -> new MsmLanternBlock(id, definition,
                    light(props.forceSolidOn().noOcclusion().pushReaction(PushReaction.POPPED), ownLight, LANTERN_LIGHT));
            case CHAIN -> new MsmChainBlock(id, definition, props.forceSolidOn().noOcclusion());
            case ROD -> new MsmRodBlock(id, definition, light(props.forceSolidOff().noOcclusion(), ownLight, ROD_LIGHT));
            case SIGN -> new MsmSignBlock(id, definition, woodType(id, definition), props.forceSolidOn().noCollision());
            case HANGING_SIGN -> new MsmCeilingHangingSignBlock(id, definition, woodType(id, definition), props.forceSolidOn().noCollision());
            case STEM -> stem(id, definition, props.noCollision().randomTicks().pushReaction(PushReaction.POPPED));
            case SCAFFOLDING -> new MsmScaffoldingBlock(id, definition, props.noCollision().dynamicShape()
                    .isValidSpawn((state, level, pos, type) -> false).isRedstoneConductor((state, level, pos) -> false)
                    .pushReaction(PushReaction.POPPED));
            default -> throw new IllegalArgumentException("block type '" + definition.type().id() + "' is not a furniture, light or sign type");
        };
    }

    /** {@code props} with the type's vanilla light unless the definition sets its own ({@code msm:light_emitter}). */
    private static BlockBehaviour.Properties light(BlockBehaviour.Properties props, boolean ownLight, int light) {
        return ownLight ? props : props.lightLevel(state -> light);
    }

    /**
     * The torch's flame: a registered particle type without options (vanilla or a project's, ADR 0080 D1); anything else
     * is a warning and the torch uses {@code minecraft:flame}.
     */
    private static SimpleParticleType particle(BlockDefinition definition, Consumer<String> warn) {
        Identifier p = ((FurnitureFields.Torch) definition.typeFields()).particle();
        if (BuiltInRegistries.PARTICLE_TYPE.containsKey(p) && BuiltInRegistries.PARTICLE_TYPE.getValue(p) instanceof SimpleParticleType simple) {
            return simple;
        }
        warn.accept("particle " + p + " is not a particle type without options; the torch uses minecraft:flame");
        return ParticleTypes.FLAME;
    }

    /**
     * The element's own wood type (ADR 0094 D6, amended after B440): named {@code <ns>:<path>}, copying the sounds and
     * block set type of its {@code wood_type}, built with Fabric's builder and not registered. The same source works on
     * 26.3 and 26.4 (B440), so no version seam is needed.
     */
    private static WoodType woodType(Identifier id, BlockDefinition definition) {
        WoodType base = BlockTypes.woodType(((FurnitureFields.Sign) definition.typeFields()).woodType());
        return WoodTypeBuilder.copyOf(base).build(id, base.setType());
    }

    /**
     * A stem: its fruit and attached form are looked up by key when it grows, its seed is the element's item id (default
     * the block's id). An unknown fruit is not an error here: the fruit may be defined later or by another mod; the
     * validators report it ({@code stem-fruit-unknown}), and a stem whose fruit is missing grows to age 7 and stays.
     */
    private static Block stem(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        FurnitureFields.Stem stem = (FurnitureFields.Stem) definition.typeFields();
        Identifier seed = seedOf(id, definition).orElse(id);
        return new MsmStemBlock(id, definition, ResourceKey.create(Registries.BLOCK, stem.fruit()),
                ResourceKey.create(Registries.BLOCK, Companions.companionId(id, BlockType.STEM).orElseThrow()),
                ResourceKey.create(Registries.ITEM, seed), TagKey.create(Registries.BLOCK, stem.soil()),
                TagKey.create(Registries.BLOCK, stem.fruitSoil()), props);
    }

    /** The item id of a definition (its block item's {@code id}, default the block's id), or empty with {@code item: false}. */
    static Optional<Identifier> seedOf(Identifier id, BlockDefinition definition) {
        return definition.item().map(settings -> settings.id().orElse(id));
    }
}
