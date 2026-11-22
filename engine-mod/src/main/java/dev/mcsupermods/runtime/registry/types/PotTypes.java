package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.loader.types.PlantFields;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.PushReaction;

/**
 * The blocks of the {@code flower_pot} type and of a {@code potted_plant} whose {@code pot} is a project pot (ADR 0103 D2
 * and its amendment after B503, X4): {@link MsmFlowerPotBlock}, a project pot with its own plant map, never a vanilla
 * {@code FlowerPotBlock}. Both take the properties of {@code potted_plant} ({@code noOcclusion}, {@code pushReaction(POPPED)};
 * see {@link PlantTypes}).
 *
 * <p>Each entry of the pot's {@code plants} gets a companion potted block (ADR 0094 D3, as the wall forms of
 * {@link Companions}): the reserved id {@code <pot id>_<plant path>} in the pot's namespace (a second plant with the same
 * path is left out, the first wins, as the lowering's {@code flowerPotCompanions}), a full copy of the pot's properties,
 * the pot's events, no item, and its own default loot table {@code <ns>:blocks/<pot path>_<plant path>}, which the
 * lowering writes (the pot and the plant). It is registered right after the pot when the plant is already registered (a
 * vanilla plant, or a project one earlier in order), else right after the plant ({@link #afterBlockRegistered}). A
 * {@code potted_plant} element whose {@code pot} is a project pot also works; one for a plant the pot lists is a load
 * error and is skipped.
 */
public final class PotTypes {
    private PotTypes() {}

    /** A listed plant waiting to be registered, with the pot and its definition. */
    private record Pending(RawDefinition raw, BlockDefinition definition, MsmFlowerPotBlock pot) {}

    /** Plant id to the pots that list it and wait for it, in registration order. */
    private static final Map<Identifier, List<Pending>> PENDING = new LinkedHashMap<>();
    /** Every potted block registered from a pot's {@code plants} (not from a {@code potted_plant} element). */
    private static final Set<Block> LISTED = Collections.newSetFromMap(new IdentityHashMap<>());

    /** The generated id of the potted companion of {@code plant} in the pot {@code pot}: {@code <pot id>_<plant path>}. */
    public static Identifier companionId(Identifier pot, Identifier plant) {
        return pot.withSuffix("_" + plant.getPath());
    }

    /** Whether {@code block} is a potted companion registered from a pot's {@code plants}. */
    public static boolean isListedCompanion(Block block) {
        return LISTED.contains(block);
    }

    /**
     * Called by {@link Companions#registerAfter} for every block the registrar has just registered: a project pot gets the
     * potted companions of its listed plants that are registered, and waits for the others; any block that a waiting pot
     * lists gets that pot's companion now. Problems are load errors for the pot's file (the companion is skipped).
     */
    static void afterBlockRegistered(RawDefinition raw, BlockDefinition definition, Block block, List<String> errors) {
        if (block instanceof MsmFlowerPotBlock pot && pot.isEmptyPot()
                && definition.typeFields() instanceof GrowingPlantFields.FlowerPot fields) {
            Set<String> paths = new HashSet<>();
            int now = 0;
            int waiting = 0;
            for (Identifier plant : fields.plants()) {
                if (!paths.add(plant.getPath())) {
                    MsmRuntime.LOGGER.warn("[{}] {}: plants: {} has the same path as an earlier plant; only the first is potted",
                            MsmRuntime.MOD_ID, raw.describe(), plant);
                    continue;
                }
                if (BuiltInRegistries.BLOCK.containsKey(plant)) {
                    now += registerListed(new Pending(raw, definition, pot), plant, errors) ? 1 : 0;
                } else {
                    PENDING.computeIfAbsent(plant, k -> new ArrayList<>()).add(new Pending(raw, definition, pot));
                    waiting++;
                }
            }
            MsmRuntime.LOGGER.info("[{}] pot {}: registered {} potted plant(s) of {} listed; {} wait for their plant",
                    MsmRuntime.MOD_ID, raw.id(), now, fields.plants().size(), waiting);
        }
        List<Pending> waiting = PENDING.remove(BuiltInRegistries.BLOCK.getKey(block));
        if (waiting != null) {
            for (Pending p : waiting) {
                registerListed(p, BuiltInRegistries.BLOCK.getKey(block), errors);
            }
        }
    }

    /** Registers the companion of {@code plantId} in {@code p}'s pot; false (with a load error) when it cannot be. */
    private static boolean registerListed(Pending p, Identifier plantId, List<String> errors) {
        Identifier id = companionId(p.raw().id(), plantId);
        Block plant = BuiltInRegistries.BLOCK.getValue(plantId);
        String problem = null;
        if (plant == Blocks.AIR) {
            problem = "is not a registered block";
        } else if (plant instanceof DoublePlantBlock) {
            problem = "is two blocks high and cannot be potted";
        } else if (BuiltInRegistries.BLOCK.containsKey(id)) {
            problem = "has the potted id " + id + ", which is already registered";
        } else if (p.pot().pottedFor(plant).isPresent()) {
            problem = "is already potted in the pot by " + BuiltInRegistries.BLOCK.getKey(p.pot().pottedFor(plant).get());
        }
        if (problem != null) {
            String message = p.raw().describe() + ": plants: " + plantId + " " + problem + "; the potted plant " + id + " is skipped";
            errors.add(message);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
            return false;
        }
        ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, id);
        MsmFlowerPotBlock companion = new MsmFlowerPotBlock(p.raw().id(), p.definition(), plant, p.pot(),
                BlockBehaviour.Properties.ofFullCopy(p.pot()).setId(key));
        Registry.register(BuiltInRegistries.BLOCK, key, companion);
        p.pot().addPotted(plant, companion);
        LISTED.add(companion);
        return true;
    }

    /** The empty pot ({@code type: "flower_pot"}); its map fills as its potted blocks are made. */
    static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        return new MsmFlowerPotBlock(id, definition, Blocks.AIR, null, properties(props));
    }

    /**
     * A {@code potted_plant} in the project pot its {@code pot} names; called from {@link PlantTypes#create} with the
     * potted plant's properties. The registrar makes potted plants after the other blocks, so the pot is registered.
     *
     * @throws IllegalArgumentException when the plant is missing or two blocks high, when {@code pot} is not a registered
     *     project {@code flower_pot}, or when that pot already has a potted block for the plant (the registrar reports a
     *     load error for the file)
     */
    static Block potted(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        PlantFields.PottedPlant fields = (PlantFields.PottedPlant) definition.typeFields();
        Identifier plantId = fields.plant();
        if (!BuiltInRegistries.BLOCK.containsKey(plantId) || BuiltInRegistries.BLOCK.getValue(plantId) == Blocks.AIR) {
            throw new IllegalArgumentException("plant " + plantId + " is not a registered block; the potted plant is skipped");
        }
        Block plant = BuiltInRegistries.BLOCK.getValue(plantId);
        if (plant instanceof DoublePlantBlock) {
            throw new IllegalArgumentException("plant " + plantId + " is two blocks high and cannot be potted; the potted plant is skipped");
        }
        Identifier potId = fields.pot();
        Block potBlock = BuiltInRegistries.BLOCK.containsKey(potId) ? BuiltInRegistries.BLOCK.getValue(potId) : null;
        if (!(potBlock instanceof MsmFlowerPotBlock pot) || !pot.isEmptyPot()) {
            throw new IllegalArgumentException("pot " + potId + " is not a registered project flower_pot (vanilla's "
                    + PlantFields.PottedPlant.VANILLA_POT + " or a block of type flower_pot); the potted plant is skipped");
        }
        pot.pottedFor(plant).ifPresent(other -> {
            throw new IllegalArgumentException("plant " + plantId + " is already potted in " + potId + " by "
                    + BuiltInRegistries.BLOCK.getKey(other) + (LISTED.contains(other) ? " (the pot lists it in plants)" : "")
                    + "; the potted plant is skipped");
        });
        MsmFlowerPotBlock block = new MsmFlowerPotBlock(id, definition, plant, pot, props);
        pot.addPotted(plant, block);
        return block;
    }

    private static BlockBehaviour.Properties properties(BlockBehaviour.Properties props) {
        return props.noOcclusion().pushReaction(PushReaction.POPPED);
    }
}
