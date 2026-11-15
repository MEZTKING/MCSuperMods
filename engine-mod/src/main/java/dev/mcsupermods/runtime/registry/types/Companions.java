package dev.mcsupermods.runtime.registry.types;

import com.google.gson.JsonElement;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.loader.types.FurnitureFields;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.HangingSignItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.StandingAndWallBlockItem;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SignBlock;
import net.minecraft.world.level.block.entity.BlockEntityTypes;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Companion blocks registered right after their element (ADR 0094 D3): the wall torch of a torch, the wall sign and wall
 * hanging sign of a sign and hanging sign ({@code <path>_wall}), the attached stem of a stem ({@code <path>_attached}).
 * A companion has a full copy of the element's block properties (strength, sound, light, loot table override), its own id
 * (so its default loot table is {@code <ns>:blocks/<path>_wall}, which the lowering writes to drop the element's item), the
 * element's events and no item of its own. Signs and their wall forms join vanilla's {@code SIGN} and {@code HANGING_SIGN}
 * block entity types (ADR 0094 D6). The element's item is made here too ({@link #blockItem}): vanilla's
 * {@link StandingAndWallBlockItem} for torches and signs (stacking to 16 for signs unless {@code item.max_stack_size} says
 * otherwise), {@link HangingSignItem} for hanging signs (16), scaffolding's own {@link MsmScaffoldingBlock.PlacingItem},
 * and a plain block item stacking to 1 for beds; both forms then give the item on pick block.
 */
public final class Companions {
    private Companions() {}

    /** Element block to its companion, in registration order. */
    private static final Map<Block, Block> COMPANIONS = new IdentityHashMap<>();

    /** The generated id of the companion of an element of {@code type}: {@code <path>_wall} or {@code <path>_attached}. */
    public static Optional<Identifier> companionId(Identifier id, BlockType type) {
        return switch (type) {
            case TORCH, SIGN, HANGING_SIGN -> Optional.of(id.withSuffix("_wall"));
            case STEM -> Optional.of(id.withSuffix("_attached"));
            default -> Optional.empty();
        };
    }

    /** {@code wall} or {@code attached}, for messages. */
    static String kind(BlockType type) {
        return type == BlockType.STEM ? "attached" : "wall";
    }

    /** The companion registered for {@code element}, if it has one. */
    public static Optional<Block> companionOf(Block element) {
        return Optional.ofNullable(COMPANIONS.get(element));
    }

    /**
     * Registers the companion of {@code block}, the just registered block of {@code definition}; called from the registrar
     * right after the block and before its item. Signs (and hanging signs) and their companions are added to vanilla's
     * sign block entity types here. A problem is added to {@code errors} (the element stays registered without its
     * companion; {@link FurnitureTypes#create} has already refused a generated id that was taken).
     */
    public static void registerAfter(RawDefinition raw, BlockDefinition definition, Block block, List<String> errors) {
        Optional<Identifier> companionId = companionId(raw.id(), definition.type());
        if (companionId.isEmpty()) {
            return;
        }
        ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, companionId.get());
        BlockBehaviour.Properties props = BlockBehaviour.Properties.ofFullCopy(block).setId(key);
        Identifier id = raw.id();
        try {
            Block companion = switch (block) {
                case MsmTorchBlock torch -> new MsmWallTorchBlock(id, definition, torch.particle(), props);
                case MsmSignBlock sign -> new MsmWallSignBlock(id, definition, sign.type(), props);
                case MsmCeilingHangingSignBlock sign -> new MsmWallHangingSignBlock(id, definition, sign.type(), props);
                case MsmStemBlock stem -> {
                    FurnitureFields.Stem fields = (FurnitureFields.Stem) definition.typeFields();
                    Identifier seed = FurnitureTypes.seedOf(id, definition).orElse(id);
                    yield new MsmAttachedStemBlock(id, definition, ResourceKey.create(Registries.BLOCK, id),
                            ResourceKey.create(Registries.BLOCK, fields.fruit()), ResourceKey.create(Registries.ITEM, seed),
                            TagKey.create(Registries.BLOCK, fields.soil()), props);
                }
                default -> throw new IllegalStateException("no companion class for " + block.getClass().getSimpleName());
            };
            Registry.register(BuiltInRegistries.BLOCK, key, companion);
            COMPANIONS.put(block, companion);
            if (block instanceof MsmSignBlock) {
                BlockEntityTypes.SIGN.addValidBlock(block);
                BlockEntityTypes.SIGN.addValidBlock(companion);
            } else if (block instanceof MsmCeilingHangingSignBlock) {
                BlockEntityTypes.HANGING_SIGN.addValidBlock(block);
                BlockEntityTypes.HANGING_SIGN.addValidBlock(companion);
            }
        } catch (RuntimeException e) {
            String message = raw.describe() + ": the " + kind(definition.type()) + " form " + companionId.get() + " could not be registered: "
                    + e.getMessage();
            errors.add(message);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
        }
    }

    /**
     * The block item of a furniture, light or sign element (see the class doc), or empty for the registrar's usual item.
     * {@code props} already carries the definition's item settings; the default stack size of beds (1) and signs (16)
     * applies only when the definition does not set {@code item.max_stack_size}.
     */
    public static Optional<BlockItem> blockItem(RawDefinition raw, BlockDefinition definition, Block block, Item.Properties props) {
        Block companion = COMPANIONS.get(block);
        return Optional.ofNullable(switch (block) {
            case MsmTorchBlock torch when companion != null -> new StandingAndWallBlockItem(torch, companion, Direction.DOWN, props);
            case MsmSignBlock sign when companion != null ->
                    new StandingAndWallBlockItem(sign, companion, Direction.DOWN, defaultStack(raw, props, 16));
            case MsmCeilingHangingSignBlock sign when companion != null -> new HangingSignItem(sign, companion, defaultStack(raw, props, 16));
            case MsmScaffoldingBlock scaffolding -> new MsmScaffoldingBlock.PlacingItem(scaffolding, props);
            case MsmBedBlock bed -> new BlockItem(bed, defaultStack(raw, props, 1));
            default -> null;
        });
    }

    /** {@code props} stacking to {@code size} unless the definition's {@code item} sets {@code max_stack_size}. */
    private static Item.Properties defaultStack(RawDefinition raw, Item.Properties props, int size) {
        JsonElement item = raw.json().get("item");
        boolean set = item != null && item.isJsonObject() && item.getAsJsonObject().has("max_stack_size");
        return set ? props : props.stacksTo(size);
    }
}
