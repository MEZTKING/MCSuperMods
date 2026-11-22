package dev.mcsupermods.runtime.gametest.spike3;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.Codec;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.registry.BlockExtras;
import dev.mcsupermods.runtime.registry.container.BlockEntityHooks;
import dev.mcsupermods.runtime.registry.types.BlockTypes;
import dev.mcsupermods.runtime.registry.types.MsmButtonBlock;
import dev.mcsupermods.runtime.registry.types.MsmDoorBlock;
import dev.mcsupermods.runtime.registry.types.MsmPressurePlateBlock;
import dev.mcsupermods.runtime.registry.types.MsmTrapDoorBlock;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BambooStalkBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CaveVines;
import net.minecraft.world.level.block.FlowerPotBlock;
import net.minecraft.world.level.block.GlowLichenBlock;
import net.minecraft.world.level.block.SmallDripleafBlock;
import net.minecraft.world.level.block.WeatheringCopper;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.WoodType;
import net.minecraft.world.level.material.MapColor;

/**
 * B503 spike (throwaway) main entrypoint: registers the spike's blocks, items, sound events, the per-player store
 * attachment, a use callback for vanilla block pairs (X12) and a lightning listener (X5). Namespace {@code msm_b503}.
 */
public final class B503Mod implements ModInitializer {
    public static final String NS = "msm_b503";
    public static final Map<String, Block> B = new LinkedHashMap<>();
    public static final Map<String, Item> I = new LinkedHashMap<>();
    public static final Map<String, SoundEvent> S = new LinkedHashMap<>();
    public static final List<String> INIT = new CopyOnWriteArrayList<>();
    public static final List<String> BOLTS = new CopyOnWriteArrayList<>();
    /** X5: when true, the lightning listener scrapes a project tin block under the bolt (the Fabric-event route). */
    public static volatile boolean scrapeOnBolt;
    public static BlockSetType ownSet;
    public static BlockSetType handlessSet;

    public static final AttachmentType<Map<String, List<ItemStack>>> STORE = AttachmentRegistry.create(id("store"),
            b -> b.persistent(Codec.unboundedMap(Codec.STRING, ItemStack.OPTIONAL_CODEC.listOf())).copyOnDeath());

    /** X12: vanilla block -> (tool transformer id -> project block). */
    public static final Map<Block, Map<Identifier, Block>> PAIRS = new IdentityHashMap<>();

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NS, path);
    }

    public static Block b(String path) {
        Block block = B.get(path);
        if (block == null) {
            throw new IllegalStateException("no spike block " + path);
        }
        return block;
    }

    static BlockBehaviour.Properties p(String path) {
        return BlockBehaviour.Properties.of().setId(ResourceKey.create(Registries.BLOCK, id(path)));
    }

    static Block reg(String path, BlockBehaviour.Properties props, Function<BlockBehaviour.Properties, Block> make, boolean item) {
        Block block = Registry.register(BuiltInRegistries.BLOCK, ResourceKey.create(Registries.BLOCK, id(path)), make.apply(props));
        B.put(path, block);
        if (item) {
            ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id(path));
            I.put(path, Registry.register(BuiltInRegistries.ITEM, key,
                    new BlockItem(block, new Item.Properties().useBlockDescriptionPrefix().setId(key))));
        }
        return block;
    }

    static Item item(String path) {
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id(path));
        Item item = Registry.register(BuiltInRegistries.ITEM, key, new Item(new Item.Properties().setId(key)));
        I.put(path, item);
        return item;
    }

    static SoundEvent sound(String path) {
        Identifier id = id(path);
        // The runtime's SoundScanner also registers the keys of this mod's assets/msm_b503/sounds.json; whichever runs first wins.
        SoundEvent e = BuiltInRegistries.SOUND_EVENT.containsKey(id) ? BuiltInRegistries.SOUND_EVENT.getValue(id)
                : Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
        INIT.add("sound " + id + (BuiltInRegistries.SOUND_EVENT.containsKey(id) ? " present" : ""));
        S.put(path, e);
        return e;
    }

    static BlockDefinition def(String json) {
        ParseResult<BlockDefinition> r = DefinitionParser.parseBlock(JsonParser.parseString(json));
        if (r.definition().isEmpty()) {
            throw new IllegalStateException("spike definition did not parse: " + r.errors());
        }
        return r.definition().get();
    }

    /** Replaces {@code vanilla} at {@code pos} with {@code ours}, keeping shared properties. */
    public static void swapVanilla(Level level, BlockPos pos, Block vanilla, Block ours) {
        BlockState s = level.getBlockState(pos);
        if (s.is(vanilla)) {
            level.setBlock(pos, BlockExtras.copyProperties(s, ours.defaultBlockState()), Block.UPDATE_ALL);
            INIT.add("swapped " + BuiltInRegistries.BLOCK.getKey(vanilla) + " for " + BuiltInRegistries.BLOCK.getKey(ours) + " at " + pos.toShortString());
        }
    }

    @Override
    public void onInitialize() {
        INIT.add("route: " + B503Version.route());
        plants();
        pots();
        weathering();
        containers();
        sounds();
        pairs();
        ServerEntityEvents.ENTITY_LOAD.register((entity, level) -> {
            if (entity instanceof LightningBolt bolt) {
                BlockPos at = bolt.blockPosition();
                String below = BuiltInRegistries.BLOCK.getKey(level.getBlockState(at.below()).getBlock()).toString();
                BOLTS.add("load tick " + level.getGameTime() + " at " + at.toShortString() + " below " + below);
                if (scrapeOnBolt) {
                    Block exposed = BuiltInRegistries.BLOCK.getValue(Identifier.fromNamespaceAndPath("msm_test", "weathering_exposed_tin"));
                    Block tin = BuiltInRegistries.BLOCK.getValue(Identifier.fromNamespaceAndPath("msm_test", "weathering_tin"));
                    if (level.getBlockState(at.below()).is(exposed)) {
                        level.setBlock(at.below(), tin.defaultBlockState(), Block.UPDATE_ALL);
                        BOLTS.add("scraped project tin at " + at.below().toShortString());
                    }
                }
            }
        });
        INIT.add("registered " + B.size() + " blocks, " + I.size() + " items, " + S.size() + " sound events");
    }

    private void plants() {
        Item berry = item("berry");
        // Kelp: naked head (vanilla body), and a head and body that name each other.
        reg("kelp_naked", p("kelp_naked").noCollision().instabreak(), q -> new B503Plants.Kelp(q, null), true);
        reg("kelp", p("kelp").noCollision().instabreak(), q -> new B503Plants.Kelp(q, () -> b("kelp_plant")), true);
        reg("kelp_plant", p("kelp_plant").noCollision().instabreak(), q -> new B503Plants.KelpPlant(q, () -> b("kelp")), false);
        reg("weeping_naked", p("weeping_naked").noCollision().instabreak(), q -> new B503Plants.Weeping(q, null), true);
        reg("weeping", p("weeping").noCollision().instabreak(), q -> new B503Plants.Weeping(q, () -> b("weeping_plant")), true);
        reg("weeping_plant", p("weeping_plant").noCollision().instabreak(), q -> new B503Plants.WeepingPlant(q, () -> b("weeping")), false);
        reg("twisting_naked", p("twisting_naked").noCollision().instabreak(), q -> new B503Plants.Twisting(q, null), true);
        reg("twisting", p("twisting").noCollision().instabreak(), q -> new B503Plants.Twisting(q, () -> b("twisting_plant")), true);
        reg("twisting_plant", p("twisting_plant").noCollision().instabreak(), q -> new B503Plants.TwistingPlant(q, () -> b("twisting")), false);
        reg("cave_naked", p("cave_naked").noCollision().instabreak().lightLevel(CaveVines.emission(14)),
                q -> new B503Plants.Cave(q, null, null), true);
        reg("cave", p("cave").noCollision().instabreak().lightLevel(CaveVines.emission(10)),
                q -> new B503Plants.Cave(q, () -> b("cave_plant"), () -> berry), true);
        reg("cave_plant", p("cave_plant").noCollision().instabreak().lightLevel(CaveVines.emission(10)),
                q -> new B503Plants.CavePlant(q, () -> b("cave"), () -> berry), false);
        reg("cane_naked", p("cane_naked").noCollision().instabreak().randomTicks(), B503Plants.Cane::new, true);
        reg("cactus_naked", p("cactus_naked").strength(0.4f).randomTicks(), B503Plants.Cactus::new, true);
        reg("bamboo_naked", p("bamboo_naked").strength(1.0f).randomTicks().noOcclusion().dynamicShape().offsetType(BlockBehaviour.OffsetType.XZ),
                BambooStalkBlock::new, true);
        reg("shoot_naked", p("shoot_naked").strength(1.0f).randomTicks().noCollision().offsetType(BlockBehaviour.OffsetType.XZ),
                q -> new B503Plants.Shoot(q, null), true);
        reg("shoot", p("shoot").strength(1.0f).randomTicks().noCollision().offsetType(BlockBehaviour.OffsetType.XZ),
                q -> new B503Plants.Shoot(q, () -> b("bamboo_naked")), true);
        reg("big_leaf_naked", p("big_leaf_naked").strength(0.1f).noOcclusion(), B503Plants.BigLeaf::new, true);
        reg("leaf_stem_naked", p("leaf_stem_naked").strength(0.1f).noCollision(), B503Plants.Stem::new, false);
        reg("small_leaf_naked", p("small_leaf_naked").noCollision().instabreak().offsetType(BlockBehaviour.OffsetType.XYZ),
                SmallDripleafBlock::new, true);
        reg("lichen_naked", p("lichen_naked").noCollision().strength(0.2f).lightLevel(GlowLichenBlock.emission(7)),
                GlowLichenBlock::new, true);
        // Soils: one in the support tags (data/minecraft/tags/block/supports_*.json), one in none.
        reg("soil_tagged", p("soil_tagged").strength(0.5f).mapColor(MapColor.DIRT), Block::new, true);
        reg("soil_plain", p("soil_plain").strength(0.5f).mapColor(MapColor.DIRT), Block::new, true);
        reg("wet_tagged", p("wet_tagged").strength(0.5f), Block::new, true);
        reg("flower", p("flower").noCollision().instabreak(), Block::new, true);
    }

    private void pots() {
        // Vanilla's pot class built with no plant and with a vanilla plant: what the shared map does (X4).
        reg("pot_air", p("pot_air").instabreak().noOcclusion(), q -> new FlowerPotBlock(Blocks.AIR, q), true);
        reg("pot_poppy", p("pot_poppy").instabreak().noOcclusion(), q -> new FlowerPotBlock(Blocks.POPPY, q), false);
        // The existing route: a project plant into vanilla's empty pot.
        reg("vpot_flower", p("vpot_flower").instabreak().noOcclusion(), q -> new FlowerPotBlock(b("flower"), q), false);
        // Our own pot with its own map.
        reg("own_pot", p("own_pot").instabreak().noOcclusion(), q -> new B503Blocks.OwnPot(q, null, null), true);
        reg("own_pot_poppy", p("own_pot_poppy").instabreak().noOcclusion(), q -> new B503Blocks.OwnPot(q, () -> Blocks.POPPY, () -> b("own_pot")), false);
        reg("own_pot_flower", p("own_pot_flower").instabreak().noOcclusion(), q -> new B503Blocks.OwnPot(q, () -> b("flower"), () -> b("own_pot")), false);
        B503Blocks.OWN_POTS.put(Blocks.POPPY, b("own_pot_poppy"));
        B503Blocks.OWN_POTS.put(b("flower"), b("own_pot_flower"));
    }

    private void weathering() {
        BlockSetType copper = BlockSetType.COPPER;
        weather("rod", "{\"format\":1,\"type\":\"rod\"}", (path, d, age, next, q) -> new B503Blocks.WRod(id(path), d, age, next, q));
        weather("button", "{\"format\":1,\"type\":\"button\",\"set_type\":\"copper\"}",
                (path, d, age, next, q) -> new B503Blocks.WButton(id(path), d, copper, age, next, q));
        weather("plate", "{\"format\":1,\"type\":\"pressure_plate\",\"set_type\":\"copper\"}",
                (path, d, age, next, q) -> new B503Blocks.WPlate(id(path), d, copper, age, next, q));
        weather("fence", "{\"format\":1,\"type\":\"fence\"}", (path, d, age, next, q) -> new B503Blocks.WFence(id(path), d, age, next, q));
        weather("gate", "{\"format\":1,\"type\":\"fence_gate\",\"wood_type\":\"oak\"}",
                (path, d, age, next, q) -> new B503Blocks.WGate(id(path), d, WoodType.OAK, age, next, q));
        weather("wall", "{\"format\":1,\"type\":\"wall\"}", (path, d, age, next, q) -> new B503Blocks.WWall(id(path), d, age, next, q));
    }

    interface WeatherMaker {
        Block make(String path, BlockDefinition d, WeatheringCopper.WeatherState age, java.util.function.Supplier<Block> next, BlockBehaviour.Properties q);
    }

    private void weather(String type, String json, WeatherMaker maker) {
        BlockDefinition d = def(json);
        String first = "w_" + type;
        String second = "w_" + type + "_exposed";
        reg(first, BlockTypes.properties(d.type(), p(first).strength(1.0f)), q -> maker.make(first, d, WeatheringCopper.WeatherState.UNAFFECTED, () -> b(second), q), true);
        reg(second, BlockTypes.properties(d.type(), p(second).strength(1.0f)), q -> maker.make(second, d, WeatheringCopper.WeatherState.EXPOSED, null, q), true);
    }

    private void containers() {
        String chest = "{\"format\":1,\"components\":{\"msm:container\":{\"rows\":3}}}";
        container("wet_chest", chest, (d, q) -> new B503Blocks.WetChest(id("wet_chest"), d, q));
        container("age_chest", chest, (d, q) -> new B503Blocks.AgingChest(id("age_chest"), d, WeatheringCopper.WeatherState.UNAFFECTED, () -> b("age_chest_exposed"), q));
        container("age_chest_exposed", chest, (d, q) -> new B503Blocks.AgingChest(id("age_chest_exposed"), d, WeatheringCopper.WeatherState.EXPOSED, null, q));
        Block d = reg("double_chest", p("double_chest").strength(2.5f).noOcclusion(), B503Blocks.DChest::new, true);
        B503Blocks.dchestType = Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, id("double_chest"),
                new BlockEntityType<>(B503Blocks.DChestEntity::new, Set.of(d)));
        reg("store", p("store").strength(2.5f), B503Blocks.StoreBlock::new, true);
        reg("store_two", p("store_two").strength(2.5f), B503Blocks.StoreBlock::new, true);
    }

    private void container(String path, String json, java.util.function.BiFunction<BlockDefinition, BlockBehaviour.Properties, Block> make) {
        BlockDefinition d = def(json);
        Block block = reg(path, p(path).strength(2.5f), q -> make.apply(d, q), true);
        List<String> errors = new ArrayList<>();
        JsonObject raw = JsonParser.parseString(json).getAsJsonObject();
        BlockEntityHooks.afterBlockRegistered(new RawDefinition("msm_runtime_gametest", "block", id(path), raw), d, block, errors);
        INIT.add("container " + path + " errors " + errors);
    }

    private void sounds() {
        SoundEvent[] five = {sound("own.break"), sound("own.step"), sound("own.place"), sound("own.hit"), sound("own.fall")};
        reg("own_sounds", B503Version.ownSounds(p("own_sounds").strength(0.5f), five, "own"), Block::new, true);
        reg("missing_sounds", B503Version.missingSounds(p("missing_sounds").strength(0.5f)), Block::new, true);
        SoundEvent[] eight = {sound("set.door_close"), sound("set.door_open"), sound("set.trapdoor_close"), sound("set.trapdoor_open"),
                sound("set.plate_off"), sound("set.plate_on"), sound("set.button_off"), sound("set.button_on")};
        ownSet = B503Version.setType("msm_b503_own", true, eight, "own");
        handlessSet = B503Version.setType("msm_b503_handless", false, eight, null);
        INIT.add("own set type: " + ownSet);
        BlockDefinition door = def("{\"format\":1,\"type\":\"door\",\"set_type\":\"wood\"}");
        BlockDefinition trap = def("{\"format\":1,\"type\":\"trapdoor\",\"set_type\":\"wood\"}");
        BlockDefinition button = def("{\"format\":1,\"type\":\"button\",\"set_type\":\"wood\"}");
        BlockDefinition plate = def("{\"format\":1,\"type\":\"pressure_plate\",\"set_type\":\"wood\"}");
        reg("own_door", BlockTypes.properties(door.type(), p("own_door").strength(1.0f).noOcclusion()),
                q -> new MsmDoorBlock(id("own_door"), door, ownSet, q), false);
        reg("handless_door", BlockTypes.properties(door.type(), p("handless_door").strength(1.0f).noOcclusion()),
                q -> new MsmDoorBlock(id("handless_door"), door, handlessSet, q), false);
        reg("own_trapdoor", BlockTypes.properties(trap.type(), p("own_trapdoor").strength(1.0f).noOcclusion()),
                q -> new MsmTrapDoorBlock(id("own_trapdoor"), trap, ownSet, q), true);
        reg("own_button", BlockTypes.properties(button.type(), p("own_button").strength(0.5f)),
                q -> new MsmButtonBlock(id("own_button"), button, ownSet, 20, q), true);
        reg("own_plate", BlockTypes.properties(plate.type(), p("own_plate").strength(0.5f)),
                q -> new MsmPressurePlateBlock(id("own_plate"), plate, ownSet, q), true);
    }

    private void pairs() {
        for (String path : List.of("stripped_stone", "flat_stone", "tilled_stone", "waxed_stone", "waxed_tuff", "ancient_copper", "burnt_marker")) {
            reg(path, p(path).strength(1.0f), Block::new, true);
        }
        Identifier axe = Identifier.withDefaultNamespace("axe");
        Identifier shovel = Identifier.withDefaultNamespace("shovel");
        Identifier hoe = Identifier.withDefaultNamespace("hoe");
        PAIRS.computeIfAbsent(Blocks.STONE, k -> new LinkedHashMap<>()).put(axe, b("stripped_stone"));
        PAIRS.computeIfAbsent(Blocks.STONE, k -> new LinkedHashMap<>()).put(shovel, b("flat_stone"));
        PAIRS.computeIfAbsent(Blocks.STONE, k -> new LinkedHashMap<>()).put(hoe, b("tilled_stone"));
        // Overriding vanilla's own pairs: oak log (axe), dirt (shovel, hoe).
        PAIRS.computeIfAbsent(Blocks.OAK_LOG, k -> new LinkedHashMap<>()).put(axe, b("stripped_stone"));
        PAIRS.computeIfAbsent(Blocks.DIRT, k -> new LinkedHashMap<>()).put(shovel, b("flat_stone"));
        PAIRS.computeIfAbsent(Blocks.DIRT, k -> new LinkedHashMap<>()).put(hoe, b("tilled_stone"));
        UseBlockCallback.EVENT.register((player, level, hand, hit) -> {
            if (player.isSpectator()) {
                return InteractionResult.PASS;
            }
            BlockPos pos = hit.getBlockPos();
            BlockState state = level.getBlockState(pos);
            ItemStack stack = player.getItemInHand(hand);
            if (stack.is(Items.HONEYCOMB) && state.is(Blocks.STONE)) {
                if (!level.isClientSide()) {
                    level.setBlock(pos, b("waxed_stone").defaultBlockState(), Block.UPDATE_ALL_IMMEDIATE);
                    stack.consume(1, player);
                }
                return InteractionResult.SUCCESS;
            }
            Holder<?> transformer = stack.get(DataComponents.BLOCK_TRANSFORMER);
            Map<Identifier, Block> pairs = PAIRS.get(state.getBlock());
            if (transformer == null || pairs == null) {
                return InteractionResult.PASS;
            }
            Identifier tool = transformer.unwrapKey().map(k -> k.identifier()).orElse(null);
            Block into = tool == null ? null : pairs.get(tool);
            if (into == null) {
                return InteractionResult.PASS;
            }
            if (!level.isClientSide()) {
                level.setBlock(pos, BlockExtras.copyProperties(state, into.defaultBlockState()), Block.UPDATE_ALL_IMMEDIATE);
                SoundEvent sound = tool.equals(axe) ? SoundEvents.AXE_STRIP.value() : tool.equals(shovel)
                        ? SoundEvents.SHOVEL_FLATTEN.value() : SoundEvents.HOE_TILL.value();
                level.playSound(null, pos, sound, SoundSource.BLOCKS, 1.0f, 1.0f);
                stack.hurtAndBreak(1, player, hand.asEquipmentSlot());
            }
            return InteractionResult.SUCCESS;
        });
        INIT.add("pairs flammable stone: " + B503Version.flammable(Blocks.STONE, 5, 20));
        INIT.add("pairs oxidise oxidized copper -> ancient copper: "
                + B503Version.oxidise(Blocks.COPPER_BLOCK.weathering().oxidized(), b("ancient_copper")));
        INIT.add("pairs waxable tuff -> waxed tuff: " + B503Version.waxable(Blocks.TUFF, b("waxed_tuff")));
    }
}
