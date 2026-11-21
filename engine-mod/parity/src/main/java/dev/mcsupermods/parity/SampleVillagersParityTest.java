package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.network.protocol.game.ServerboundPlayerCommandPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.FluidTags;
import net.minecraft.tags.PoiTypeTags;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.entity.DispenserBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.dimension.DimensionType;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-villagers-and-fluids} (namespace {@code msm_sample_villagers}, ADRs 0098
 * to 0100), on content jars only: traders, professions, mob storage, shoulder pets and fluids are not part of the Java
 * project eject (B478 warns and strips them), so the filter is {@code msm_parity_tests:sample_villagers_*}. Black-box
 * through vanilla and Fabric API alone (ADR 0033 D5): the registries, a real {@link ServerPlayer} ({@link ParityEars})
 * using mobs, items and blocks as the network handler does, vanilla's {@link Merchant} and {@link MerchantMenu}, the
 * mobs' saved data ({@code Offers}, {@code Xp}, {@code TraderLevel}, {@code RestockHalfDay}; {@code StorageItems},
 * {@code StorageChest}; {@code Perched}) and the blocks and entities in the world.
 *
 * <p>Covered (the B482 list): what registers on each version (fluid counts differ: 26.3 registers a source and a
 * {@code flowing_} fluid per liquid, 26.4 one), the Glow Moon's dimension type (the GameTest server makes no level of a
 * data pack dimension, limit P8; the headless server check pins the level); the pedlar's offers per level, a trade
 * paying, rewarding XP and levelling up into its second set and vanilla's wandering trader set, restocking in the next
 * half day and saving; the glassblower: its point of interest, a villager trading from its sets and a free villager
 * taking the job at the bench and losing it when the bench breaks; the pack mule's chest, store, inventory key, saving
 * and drops; the sugar glider perching on its owner and jumping down when the owner is hurt; brine and molten amber
 * flowing by their own numbers, sources, buckets, dispensers, light and what they do to entities (swimming, putting out
 * fire, drowning, glowing from {@code on_entity_inside}; burning).
 */
public class SampleVillagersParityTest {
    static final String NAMESPACE = "msm_sample_villagers";
    private static final String ARENA = "msm_parity_tests:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    private static boolean twoFluids() {
        return SharedConstants.getCurrentVersion().name().startsWith("26.3");
    }

    @SuppressWarnings("unchecked")
    static <T extends Mob> EntityType<T> type(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id(path)), "entity type " + id(path) + " is not registered");
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    /** Whether {@code state} is a state of the liquid {@code path} (its block is the liquid block). */
    static boolean ours(GameTestHelper helper, FluidState state, String path) {
        return !state.isEmpty() && state.createLegacyBlock().is(block(helper, path));
    }

    /** The entity's saved data, as the world saves it. */
    static CompoundTag saved(GameTestHelper helper, Entity entity) {
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, helper.getLevel().registryAccess());
        entity.saveWithoutId(out);
        return out.buildResult();
    }

    /** A survival player at {@code at} who has sent the client's first packet (until then it takes no damage). */
    static ParityEars player(GameTestHelper helper, BlockPos at, String name) {
        ParityEars ears = new ParityEars(helper, at, GameType.SURVIVAL, name);
        ears.player.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
        ears.player.setOnGround(true);
        return ears;
    }

    /** A main-hand right-click on {@code entity} holding {@code held}, sneaking or not, as the network handler does. */
    static InteractionResult use(ServerPlayer player, Entity entity, ItemStack held, boolean sneaking) {
        player.setShiftKeyDown(sneaking);
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        InteractionResult result = player.interactOn(entity, InteractionHand.MAIN_HAND, Vec3.ZERO);
        player.setShiftKeyDown(false);
        return result;
    }

    static String key(Holder<?> holder) {
        return holder.unwrapKey().map(k -> k.identifier().toString()).orElse("(unnamed)");
    }

    static String itemId(ItemStack stack) {
        return BuiltInRegistries.ITEM.getKey(stack.getItem()).getPath();
    }

    /** The offers as {@code "<count> <item> -> <count> <item> uses <uses>/<max>"}, sorted. */
    static List<String> describe(MerchantOffers offers) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : offers) {
            out.add(o.getCostA().getCount() + " " + itemId(o.getCostA()) + " -> " + o.getResult().getCount() + " " + itemId(o.getResult())
                    + " uses " + o.getUses() + "/" + o.getMaxUses());
        }
        return out.stream().sorted().toList();
    }

    static MerchantMenu open(GameTestHelper helper, ServerPlayer player, Entity merchant) {
        use(player, merchant, ItemStack.EMPTY, false);
        if (!(player.containerMenu instanceof MerchantMenu menu)) {
            throw helper.assertionException("no merchant menu: " + player.containerMenu.getClass().getSimpleName());
        }
        return menu;
    }

    static int index(MerchantOffers offers, Item result, Item cost) {
        for (int i = 0; i < offers.size(); i++) {
            if (offers.get(i).getResult().is(result) && offers.get(i).getCostA().is(cost)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Selects the offer of {@code result} paid with {@code cost}, puts {@code count} of the cost in the payment slot and
     * shift-clicks the result (which trades as often as the payment and the offer allow), then empties the slot.
     */
    static MerchantOffer trade(GameTestHelper helper, ServerPlayer player, MerchantMenu menu, Item result, Item cost, int count) {
        int i = index(menu.getOffers(), result, cost);
        helper.assertTrue(i >= 0, "no offer of " + result + " paid with " + cost + " in " + describe(menu.getOffers()));
        menu.setSelectionHint(i);
        menu.getSlot(0).set(new ItemStack(cost, count));
        menu.slotsChanged(menu.getSlot(0).container);
        menu.clicked(2, 0, ContainerInput.QUICK_MOVE, player);
        MerchantOffer offer = menu.getOffers().get(i);
        menu.getSlot(0).set(ItemStack.EMPTY);
        return offer;
    }

    static int dropped(GameTestHelper helper, Vec3 around, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(around, around).inflate(4), e -> e.getItem().is(item)).stream()
                .mapToInt(e -> e.getItem().getCount()).sum();
    }

    static Holder<VillagerProfession> glassblower() {
        return BuiltInRegistries.VILLAGER_PROFESSION.wrapAsHolder(BuiltInRegistries.VILLAGER_PROFESSION.getValue(id("glassblower")));
    }

    // What registers

    /**
     * The three mobs and their spawn eggs, the bench and its item, the two fluids (with {@code flowing_} fluids on 26.3)
     * with their liquid blocks, buckets, tags and light, the glassblower with its point of interest and default trade
     * sets, and the Glow Moon's dimension type.
     */
    @GameTest
    public void everythingRegistersWithTheCountsOfThisVersion(GameTestHelper helper) {
        for (String mob : List.of("pedlar", "pack_mule", "sugar_glider")) {
            type(helper, mob);
            item(helper, mob + "_spawn_egg");
        }
        helper.assertTrue(type(helper, "sugar_glider").create(helper.getLevel(), EntitySpawnReason.COMMAND) instanceof TamableAnimal,
                "the sugar glider cannot be tamed");
        block(helper, "glassblower_bench");
        item(helper, "glassblower_bench");

        long fluids = BuiltInRegistries.FLUID.keySet().stream().filter(k -> k.getNamespace().equals(NAMESPACE)).count();
        helper.assertValueEqual(fluids, twoFluids() ? 4L : 2L, "fluids in the namespace on " + SharedConstants.getCurrentVersion().name());
        for (String path : List.of("brine", "molten_amber")) {
            helper.assertTrue(BuiltInRegistries.FLUID.containsKey(id(path)), "fluid " + id(path));
            helper.assertValueEqual(BuiltInRegistries.FLUID.containsKey(id("flowing_" + path)), twoFluids(), "flowing_" + path);
            Fluid fluid = BuiltInRegistries.FLUID.getValue(id(path));
            BlockState liquid = block(helper, path).defaultBlockState();
            helper.assertTrue(liquid.liquid() && liquid.canBeReplaced(), path + " block is not a replaceable liquid");
            helper.assertTrue(liquid.getFluidState().getType() == fluid && liquid.getFluidState().isSource(), path + " block holds " + liquid.getFluidState());
            Item bucket = item(helper, path + "_bucket");
            helper.assertTrue(bucket instanceof BucketItem b && b.getContent() == fluid, path + " bucket holds the fluid");
            // 26.3 answers the item, 26.4 its key: both print the bucket's id.
            helper.assertTrue(String.valueOf(fluid.getBucket()).contains(id(path + "_bucket").toString()),
                    path + " fluid names bucket " + fluid.getBucket());
            helper.assertValueEqual(new ItemStack(bucket).getMaxStackSize(), 1, path + " bucket stack size");
        }
        FluidState brine = block(helper, "brine").defaultBlockState().getFluidState();
        FluidState amber = block(helper, "molten_amber").defaultBlockState().getFluidState();
        helper.assertTrue(brine.is(FluidTags.WATER) && !brine.is(FluidTags.LAVA), "brine is not in #minecraft:water alone");
        helper.assertTrue(amber.is(FluidTags.LAVA) && !amber.is(FluidTags.WATER), "molten amber is not in #minecraft:lava alone");
        helper.assertValueEqual(block(helper, "brine").defaultBlockState().getLightEmission(), 0, "brine light");
        helper.assertValueEqual(block(helper, "molten_amber").defaultBlockState().getLightEmission(), 12, "molten amber light");

        helper.assertTrue(BuiltInRegistries.VILLAGER_PROFESSION.containsKey(id("glassblower")), "the glassblower is not registered");
        VillagerProfession job = glassblower().value();
        helper.assertValueEqual(job.name().getContents() instanceof TranslatableContents t ? t.getKey() : "<literal>",
                "entity." + NAMESPACE + ".villager.glassblower", "the job's name key");
        for (int level = 1; level <= 5; level++) {
            helper.assertValueEqual(job.getTrades(level).identifier(), id("glassblower/level_" + level), "trade set " + level);
        }
        for (BlockState state : block(helper, "glassblower_bench").getStateDefinition().getPossibleStates()) {
            Optional<Holder<PoiType>> poi = PoiTypes.forState(state);
            helper.assertTrue(poi.isPresent(), "no point of interest for " + state);
            helper.assertValueEqual(key(poi.get()), id("glassblower").toString(), "the bench's point of interest");
            helper.assertTrue(poi.get().is(PoiTypeTags.ACQUIRABLE_JOB_SITE), "the bench is not an acquirable job site");
            helper.assertTrue(job.heldJobSite().test(poi.get()), "the glassblower does not hold the bench");
        }

        Optional<Holder.Reference<DimensionType>> moon = helper.getLevel().registryAccess().lookupOrThrow(Registries.DIMENSION_TYPE)
                .get(ResourceKey.create(Registries.DIMENSION_TYPE, id("glow_moon_sky")));
        helper.assertTrue(moon.isPresent(), "no dimension type glow_moon_sky");
        DimensionType sky = moon.get().value();
        helper.assertTrue(sky.hasSkyLight() && !sky.hasCeiling() && sky.hasFixedTime(), "glow_moon_sky's light, ceiling or fixed time");
        helper.assertValueEqual(sky.minY(), 0, "glow_moon_sky min_y");
        helper.assertValueEqual(sky.height(), 256, "glow_moon_sky height");
        helper.succeed();
    }

    // The pedlar (msm:trader)

    /**
     * Level 1 offers come from {@code pedlar/level_1}; two wheat trades pay two emeralds, give XP orbs and reach level 2
     * ({@code xp_to_next} 10), which adds {@code pedlar/level_2}'s name tag; two name tags reach level 3 (30), which
     * draws vanilla's {@code minecraft:wandering_trader/common}. XP and level are saved.
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void thePedlarTradesPaysXpAndLevelsUp(GameTestHelper helper) {
        Mob pedlar = helper.spawnWithNoFreeWill(type(helper, "pedlar"), MID);
        try (ParityEars ears = player(helper, MID.east(2), "msm-vl-trader")) {
            ServerPlayer player = ears.player;
            helper.assertTrue(pedlar instanceof Merchant, "the pedlar is no merchant");
            MerchantMenu menu = open(helper, player, pedlar);
            helper.assertValueEqual(describe(menu.getOffers()),
                    List.of("1 emerald -> 6 glow_berries uses 0/3", "10 wheat -> 1 emerald uses 0/4"), "level 1 offers");
            helper.assertTrue(((Merchant) pedlar).showProgressBar(), "levels: no progress bar");

            MerchantOffer wheat = trade(helper, player, menu, Items.EMERALD, Items.WHEAT, 20);
            helper.assertValueEqual(wheat.getUses(), 2, "wheat trades in one shift-click");
            helper.assertValueEqual(player.getInventory().countItem(Items.EMERALD), 2, "emeralds paid");
            helper.assertTrue(!helper.getLevel().getEntitiesOfClass(ExperienceOrb.class, new AABB(pedlar.blockPosition()).inflate(3)).isEmpty(),
                    "no experience orbs");
            CompoundTag afterWheat = saved(helper, pedlar);
            helper.assertValueEqual(afterWheat.getIntOr("Xp", -1), 10, "XP after two wheat trades");
            helper.assertValueEqual(afterWheat.getIntOr("TraderLevel", -1), 2, "level after 10 XP");
            helper.assertTrue(describe(menu.getOffers()).contains("5 emerald -> 1 name_tag uses 0/2"),
                    "level 2 added no name tag: " + describe(menu.getOffers()));
            helper.assertValueEqual(menu.getOffers().size(), 3, "offers at level 2");

            player.getInventory().add(new ItemStack(Items.EMERALD, 8));
            MerchantOffer tag = trade(helper, player, menu, Items.NAME_TAG, Items.EMERALD, 10);
            helper.assertTrue(tag.getResult().is(Items.NAME_TAG) && tag.getUses() == 2, "name tags bought: " + describe(menu.getOffers()));
            helper.assertValueEqual(player.getInventory().countItem(Items.NAME_TAG), 2, "name tags received");
            CompoundTag afterTags = saved(helper, pedlar);
            helper.assertValueEqual(afterTags.getIntOr("Xp", -1), 30, "XP after the name tags");
            helper.assertValueEqual(afterTags.getIntOr("TraderLevel", -1), 3, "level after 30 XP");
            helper.assertTrue(((Merchant) pedlar).getOffers().size() > 3,
                    "level 3 drew nothing from minecraft:wandering_trader/common: " + describe(((Merchant) pedlar).getOffers()));
            player.closeContainer();
            helper.assertTrue(((Merchant) pedlar).getTradingPlayer() == null, "the pedlar kept its customer");
        }
        helper.succeed();
    }

    /**
     * Used-up offers stay used up in the same half day and refill in the next one (restock twice a day, read from the
     * saved {@code RestockHalfDay}); offers and their uses are saved with the mob; a baby pedlar does not trade.
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void offersRestockInTheNextHalfDayAndAreSaved(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Mob pedlar = helper.spawnWithNoFreeWill(type(helper, "pedlar"), MID);
        try (ParityEars ears = player(helper, MID.east(2), "msm-vl-restock")) {
            ServerPlayer player = ears.player;
            MerchantMenu menu = open(helper, player, pedlar);
            MerchantOffer berries = trade(helper, player, menu, Items.GLOW_BERRIES, Items.EMERALD, 3);
            helper.assertTrue(berries.getResult().is(Items.GLOW_BERRIES) && berries.isOutOfStock(), "glow berries not used up: " + describe(menu.getOffers()));
            helper.assertValueEqual(player.getInventory().countItem(Items.GLOW_BERRIES), 18, "glow berries received");
            player.closeContainer();
            open(helper, player, pedlar);
            helper.assertTrue(describe(((Merchant) pedlar).getOffers()).contains("1 emerald -> 6 glow_berries uses 3/3"),
                    "restocked within the same half day: " + describe(((Merchant) pedlar).getOffers()));
            player.closeContainer();

            CompoundTag tag = saved(helper, pedlar);
            helper.assertTrue(tag.contains("Offers") && tag.contains("Xp") && tag.contains("TraderLevel") && tag.contains("RestockHalfDay"),
                    "save keys: " + tag.keySet());
            long halfDay = tag.getLongOr("RestockHalfDay", Long.MIN_VALUE);
            // The same pedlar saved in the half day before: opening it now is the first look in a new half day.
            tag.remove("UUID");
            tag.putLong("RestockHalfDay", halfDay - 1);
            pedlar.discard();
            Mob copy = type(helper, "pedlar").create(level, EntitySpawnReason.LOAD);
            helper.assertTrue(copy != null, "no copy of the pedlar");
            copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
            copy.setNoAi(true);
            level.addFreshEntity(copy);
            helper.assertValueEqual(describe(((Merchant) copy).getOffers()).contains("1 emerald -> 6 glow_berries uses 3/3"), true,
                    "the loaded pedlar lost its used offer: " + describe(((Merchant) copy).getOffers()));
            open(helper, player, copy);
            helper.assertTrue(describe(((Merchant) copy).getOffers()).contains("1 emerald -> 6 glow_berries uses 0/3"),
                    "no restock in the next half day: " + describe(((Merchant) copy).getOffers()));
            player.closeContainer();

            Mob baby = helper.spawnWithNoFreeWill(type(helper, "pedlar"), MID.north(3));
            baby.setBaby(true);
            if (baby.isBaby()) {
                use(player, baby, ItemStack.EMPTY, false);
                helper.assertFalse(player.containerMenu instanceof MerchantMenu, "a baby pedlar traded");
            }
        }
        helper.succeed();
    }

    // The glassblower (msm:villager_profession)

    /** A villager given the job trades from {@code glassblower/level_1}: both of the job's own trades, and they pay. */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void aGlassblowerTradesFromItsOwnSet(GameTestHelper helper) {
        Villager villager = helper.spawnWithNoFreeWill(EntityTypes.VILLAGER, MID);
        villager.setVillagerData(villager.getVillagerData().withProfession(glassblower()));
        helper.assertValueEqual(describe(villager.getOffers()),
                List.of("1 emerald -> 4 glass uses 0/12", "12 sand -> 1 emerald uses 0/16"), "level 1 offers");
        try (ParityEars ears = player(helper, MID.east(2), "msm-vl-glass")) {
            ServerPlayer player = ears.player;
            MerchantMenu menu = open(helper, player, villager);
            MerchantOffer sand = trade(helper, player, menu, Items.EMERALD, Items.SAND, 12);
            helper.assertValueEqual(sand.getUses(), 1, "sand trades");
            helper.assertValueEqual(player.getInventory().countItem(Items.EMERALD), 1, "the emerald for the sand");
            helper.assertValueEqual(villager.getVillagerXp(), 2, "the villager's trading XP");
            player.closeContainer();
        }
        helper.succeed();
    }

    /**
     * A villager with free will in the walled arena takes the glassblower job at the bench, with the job's offers, and
     * loses it (no trading XP yet) when the bench is broken.
     */
    @GameTest(structure = ARENA, maxTicks = 2400)
    public void aVillagerTakesTheJobAtTheBenchAndLosesItWhenItBreaks(GameTestHelper helper) {
        BlockPos bench = new BlockPos(2, 1, 2);
        Villager villager = helper.spawn(EntityTypes.VILLAGER, new BlockPos(7, 1, 7));
        helper.setBlock(bench, block(helper, "glassblower_bench"));
        int[] stage = {0};
        helper.onEachTick(() -> {
            Holder<VillagerProfession> now = villager.getVillagerData().profession();
            if (stage[0] == 0 && now.is(id("glassblower"))) {
                helper.assertValueEqual(describe(villager.getOffers()),
                        List.of("1 emerald -> 4 glass uses 0/12", "12 sand -> 1 emerald uses 0/16"), "the new glassblower's offers");
                helper.destroyBlock(bench);
                stage[0] = 1;
            } else if (stage[0] == 0 && !now.is(VillagerProfession.NONE)) {
                helper.fail("the villager took another job: " + key(now));
            } else if (stage[0] == 1 && now.is(VillagerProfession.NONE)) {
                helper.succeed();
            }
        });
    }

    // The pack mule (msm:storage, needs_chest)

    /**
     * The tamed mule has no store until a chest is used on it (one chest taken); then its owner's sneaking use and the
     * inventory key from the saddle open three rows; the contents and the chest are saved and dropped when it dies.
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void thePackMulesStoreNeedsAChestOpensSavesAndDrops(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Mob mule = helper.spawnWithNoFreeWill(type(helper, "pack_mule"), MID);
        try (ParityEars ears = player(helper, MID.east(2), "msm-vl-mule")) {
            ServerPlayer owner = ears.player;
            helper.assertTrue(mule instanceof TamableAnimal, "the pack mule cannot be tamed");
            ((TamableAnimal) mule).tame(owner);
            use(owner, mule, ItemStack.EMPTY, true);
            helper.assertFalse(owner.containerMenu instanceof ChestMenu, "a store opened before the chest");
            ItemStack chests = new ItemStack(Items.CHEST, 2);
            use(owner, mule, chests, false);
            helper.assertValueEqual(owner.getMainHandItem().getCount(), 1, "chests left after adding one");
            helper.assertTrue(saved(helper, mule).getBooleanOr("StorageChest", false), "no chest saved");

            use(owner, mule, ItemStack.EMPTY, true);
            if (!(owner.containerMenu instanceof ChestMenu store)) {
                throw helper.assertionException("the owner's sneaking use opened " + owner.containerMenu.getClass().getSimpleName());
            }
            helper.assertValueEqual(store.getRowCount(), 3, "rows");
            helper.assertTrue(store.getType() == MenuType.GENERIC_9x3, "the store's menu type");
            store.getSlot(0).set(new ItemStack(Items.DIAMOND, 5));
            store.getSlot(26).set(new ItemStack(Items.APPLE, 3));
            owner.closeContainer();
            CompoundTag tag = saved(helper, mule);
            helper.assertTrue(tag.contains("StorageItems"), "no StorageItems saved: " + tag.keySet());

            helper.assertTrue(owner.startRiding(mule, true, true), "the owner could not ride the mule");
            owner.connection.handlePlayerCommand(new ServerboundPlayerCommandPacket(owner, ServerboundPlayerCommandPacket.Action.OPEN_INVENTORY));
            if (!(owner.containerMenu instanceof ChestMenu fromSaddle)) {
                throw helper.assertionException("the inventory key from the saddle opened " + owner.containerMenu.getClass().getSimpleName());
            }
            helper.assertTrue(fromSaddle.getSlot(0).getItem().is(Items.DIAMOND) && fromSaddle.getSlot(0).getItem().getCount() == 5,
                    "slot 0 from the saddle: " + fromSaddle.getSlot(0).getItem());
            owner.closeContainer();
            owner.stopRiding();

            Mob copy = type(helper, "pack_mule").create(level, EntitySpawnReason.LOAD);
            helper.assertTrue(copy != null, "no copy of the mule");
            CompoundTag forCopy = tag.copy();
            forCopy.remove("UUID");
            copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), forCopy));
            CompoundTag reloaded = saved(helper, copy);
            helper.assertTrue(reloaded.getBooleanOr("StorageChest", false) && reloaded.contains("StorageItems"),
                    "the loaded mule lost its store: " + reloaded.keySet());

            Vec3 at = mule.position();
            mule.kill(level);
            helper.assertValueEqual(dropped(helper, at, Items.DIAMOND), 5, "diamonds dropped");
            helper.assertValueEqual(dropped(helper, at, Items.APPLE), 3, "apples dropped");
            helper.assertValueEqual(dropped(helper, at, Items.CHEST), 1, "the chest dropped");
        }
        helper.succeed();
    }

    // The sugar glider (msm:shoulder_riding)

    /**
     * A tamed sugar glider walks to its owner standing nearby and perches on the shoulder (saved {@code Perched}, at the
     * owner's shoulder height, no gravity); the owner taking damage throws it off.
     */
    @GameTest(structure = ARENA, maxTicks = 300)
    public void theSugarGliderPerchesAndJumpsDownWhenTheOwnerIsHurt(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Mob glider = helper.spawn(type(helper, "sugar_glider"), new BlockPos(2, 1, 5));
        ParityEars ears = player(helper, new BlockPos(6, 1, 5), "msm-vl-shoulder");
        ServerPlayer owner = ears.player;
        ((TamableAnimal) glider).tame(owner);
        int[] stage = {0};
        AtomicLong perchedAt = new AtomicLong(-1);
        helper.onEachTick(() -> {
            owner.setOnGround(true);
            boolean perched = saved(helper, glider).getBooleanOr("Perched", false);
            if (stage[0] == 0 && perched) {
                double up = glider.getY() - owner.getY();
                helper.assertTrue(up > 1.0 && up < 1.6, "the glider sits " + up + " blocks above the owner's feet");
                helper.assertTrue(glider.position().distanceTo(owner.position()) < 1.6, "the glider is not at the owner: " + glider.position());
                helper.assertTrue(glider.isNoGravity(), "a perched glider has gravity");
                perchedAt.set(helper.getTick());
                helper.assertTrue(owner.hurtServer(level, level.damageSources().fellOutOfWorld(), 1.0f), "the owner was not hurt");
                stage[0] = 1;
            } else if (stage[0] == 1 && helper.getTick() > perchedAt.get() + 1) {
                helper.assertFalse(perched, "the glider stayed on a hurt owner");
                helper.assertFalse(glider.isNoGravity(), "the glider kept no gravity after jumping down");
                ears.close();
                helper.succeed();
            }
        });
    }

    // Brine and molten amber (msm:fluid)

    /**
     * A source by the west wall: the first block east fills after the fluid's {@code tick_delay}; the row east ends after
     * {@code ceil(8 / drop_off) - 1} blocks with amounts falling by {@code drop_off}; without its source it all drains.
     */
    private static void flow(GameTestHelper helper, String path, int delay, int dropOff) {
        BlockPos source = new BlockPos(1, 1, 5);
        int reach = (8 + dropOff - 1) / dropOff - 1;
        AtomicLong firstSpread = new AtomicLong(-1);
        AtomicInteger count = new AtomicInteger();
        long start = helper.getTick();
        helper.setBlock(source, block(helper, path));
        helper.onEachTick(() -> {
            int n = 0;
            for (int x = 1; x <= 9; x++) {
                for (int z = 1; z <= 9; z++) {
                    if (ours(helper, helper.getBlockState(new BlockPos(x, 1, z)).getFluidState(), path)) {
                        n++;
                    }
                }
            }
            count.set(n);
            if (firstSpread.get() < 0 && ours(helper, helper.getBlockState(source.east()).getFluidState(), path)) {
                firstSpread.set(helper.getTick() - start);
            }
        });
        int settle = delay * (reach + 3);
        helper.runAfterDelay(settle, () -> {
            helper.assertTrue(firstSpread.get() >= delay && firstSpread.get() <= delay + 1,
                    path + " first spread after " + firstSpread.get() + " ticks, tick_delay " + delay);
            for (int dx = 0; dx <= reach; dx++) {
                FluidState s = helper.getBlockState(source.east(dx)).getFluidState();
                int expected = dx == 0 ? 8 : 8 - dx * dropOff;
                helper.assertTrue(ours(helper, s, path) && s.getAmount() == expected && s.isSource() == (dx == 0),
                        path + " " + dx + " east: " + s + ", expected amount " + expected);
            }
            helper.assertFalse(ours(helper, helper.getBlockState(source.east(reach + 1)).getFluidState(), path),
                    path + " reaches past " + reach + " blocks");
            helper.setBlock(source, Blocks.AIR);
        });
        helper.runAfterDelay(settle + 1 + delay * (reach + 4L), () -> {
            helper.assertValueEqual(count.get(), 0, path + " blocks left after draining");
            helper.succeed();
        });
    }

    @GameTest(structure = ARENA, maxTicks = 200)
    public void brineFlowsAsWaterDoes(GameTestHelper helper) {
        flow(helper, "brine", 5, 1);
    }

    @GameTest(structure = ARENA, maxTicks = 200)
    public void moltenAmberFlowsByItsOwnNumbers(GameTestHelper helper) {
        flow(helper, "molten_amber", 10, 2);
    }

    /** Two sources a block apart make a new source between them for brine (infinite) and not for molten amber. */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void brineMakesNewSourcesAndMoltenAmberDoesNot(GameTestHelper helper) {
        BlockPos brine = new BlockPos(4, 1, 2);
        BlockPos amber = new BlockPos(4, 1, 8);
        // A stone row across the middle keeps the two apart (water-like and lava-like would mix).
        for (int x = 1; x <= 9; x++) {
            helper.setBlock(x, 1, 5, Blocks.STONE);
        }
        helper.setBlock(brine.west(), block(helper, "brine"));
        helper.setBlock(brine.east(), block(helper, "brine"));
        helper.setBlock(amber.west(), block(helper, "molten_amber"));
        helper.setBlock(amber.east(), block(helper, "molten_amber"));
        helper.runAfterDelay(50, () -> {
            FluidState b = helper.getBlockState(brine).getFluidState();
            FluidState a = helper.getBlockState(amber).getFluidState();
            helper.assertTrue(ours(helper, b, "brine") && b.isSource(), "brine between two sources: " + b);
            helper.assertTrue(ours(helper, a, "molten_amber") && !a.isSource(), "molten amber between two sources: " + a);
            helper.succeed();
        });
    }

    /** Molten amber lights its block at 12, less one a block away. */
    @GameTest(structure = ARENA, maxTicks = 40)
    public void moltenAmberGivesLight(GameTestHelper helper) {
        BlockPos at = MID;
        for (Direction side : Direction.Plane.HORIZONTAL) {
            helper.setBlock(at.relative(side), Blocks.GLASS);
        }
        helper.setBlock(at, block(helper, "molten_amber"));
        helper.runAfterDelay(5, () -> {
            helper.assertValueEqual(helper.getLevel().getBrightness(LightLayer.BLOCK, helper.absolutePos(at)), 12, "light in the block");
            helper.assertValueEqual(helper.getLevel().getBrightness(LightLayer.BLOCK, helper.absolutePos(at.above())), 11, "light above");
            helper.succeed();
        });
    }

    /** An empty bucket takes each fluid's source and becomes its bucket; that bucket pours the source back. */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void bucketsFillAndPour(GameTestHelper helper) {
        BlockPos[] spots = {new BlockPos(3, 1, 5), new BlockPos(7, 1, 5)};
        String[] fluids = {"brine", "molten_amber"};
        for (int i = 0; i < 2; i++) {
            helper.setBlock(spots[i], block(helper, fluids[i]));
        }
        helper.runAfterDelay(1, () -> {
            for (int i = 0; i < 2; i++) {
                String path = fluids[i];
                try (ParityEars ears = player(helper, spots[i].above(), "msm-vl-bucket-" + i)) {
                    ServerPlayer player = ears.player;
                    Vec3 feet = helper.absoluteVec(new Vec3(spots[i].getX() + 0.5, 2.2, spots[i].getZ() + 0.5));
                    player.snapTo(feet.x, feet.y, feet.z, 0f, 90f);
                    player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BUCKET));
                    InteractionResult filled = player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
                    helper.assertTrue(filled.consumesAction(), path + " fill: " + filled);
                    helper.assertTrue(player.getMainHandItem().is(item(helper, path + "_bucket")), path + " hand: " + player.getMainHandItem());
                    helper.assertTrue(helper.getBlockState(spots[i]).isAir(), path + " source left: " + helper.getBlockState(spots[i]));
                    InteractionResult poured = player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
                    helper.assertTrue(poured.consumesAction(), path + " pour: " + poured);
                    helper.assertTrue(player.getMainHandItem().is(Items.BUCKET), path + " hand after pouring: " + player.getMainHandItem());
                    FluidState placed = helper.getBlockState(spots[i]).getFluidState();
                    helper.assertTrue(ours(helper, placed, path) && placed.isSource(), path + " poured " + placed);
                }
            }
            helper.succeed();
        });
    }

    /** A dispenser pours a brine bucket and keeps the empty bucket; powered again, it takes the source back. */
    @GameTest(structure = ARENA, maxTicks = 40)
    public void aDispenserPoursAndTakesBrine(GameTestHelper helper) {
        BlockPos at = new BlockPos(5, 1, 2);
        BlockPos front = at.south();
        BlockPos power = at.west();
        helper.setBlock(at, Blocks.DISPENSER.defaultBlockState().setValue(DispenserBlock.FACING, Direction.SOUTH));
        Item bucket = item(helper, "brine_bucket");
        helper.runAfterDelay(1, () -> {
            DispenserBlockEntity dispenser = helper.getBlockEntity(at, DispenserBlockEntity.class);
            dispenser.insertItem(new ItemStack(bucket));
            helper.setBlock(power, Blocks.REDSTONE_BLOCK);
        });
        helper.runAfterDelay(10, () -> {
            DispenserBlockEntity dispenser = helper.getBlockEntity(at, DispenserBlockEntity.class);
            FluidState poured = helper.getBlockState(front).getFluidState();
            helper.assertTrue(ours(helper, poured, "brine") && poured.isSource(), "dispensed " + poured);
            helper.assertTrue(dispenser.getItem(0).is(Items.BUCKET), "slot after pouring " + dispenser.getItem(0));
            helper.setBlock(power, Blocks.AIR);
        });
        helper.runAfterDelay(14, () -> helper.setBlock(power, Blocks.REDSTONE_BLOCK));
        helper.runAfterDelay(24, () -> {
            DispenserBlockEntity dispenser = helper.getBlockEntity(at, DispenserBlockEntity.class);
            helper.assertTrue(dispenser.getItem(0).is(bucket), "slot after taking it back " + dispenser.getItem(0));
            helper.succeed();
        });
    }

    private static void fill(GameTestHelper helper, String path) {
        BlockState fill = block(helper, path).defaultBlockState();
        for (int x = 1; x <= 9; x++) {
            for (int z = 1; z <= 9; z++) {
                for (int y = 1; y <= 3; y++) {
                    helper.setBlock(new BlockPos(x, y, z), fill);
                }
            }
        }
    }

    private static Mob still(GameTestHelper helper, double x, double z) {
        Mob cow = helper.spawn(EntityTypes.COW, new Vec3(x, 1, z));
        cow.setNoAi(true);
        return cow;
    }

    private static String damage(LivingEntity e) {
        return e.getLastDamageSource() == null ? "none" : e.getLastDamageSource().getMsgId();
    }

    /**
     * In brine a cow is in water, a burning cow is put out, a cow out of air drowns, and {@code on_entity_inside} makes
     * them glow.
     */
    @GameTest(structure = ARENA, maxTicks = 120)
    public void brineIsWaterToEntitiesAndMakesThemGlow(GameTestHelper helper) {
        fill(helper, "brine");
        Mob cow = still(helper, 5.5, 5.5);
        Mob burning = still(helper, 2.5, 2.5);
        Mob drowning = still(helper, 8.5, 8.5);
        helper.runAfterDelay(5, () -> {
            helper.assertTrue(cow.isInWater() && !cow.isInLava(), "in water " + cow.isInWater() + ", in lava " + cow.isInLava());
            burning.setRemainingFireTicks(200);
            drowning.setAirSupply(0);
        });
        helper.runAfterDelay(9, () -> helper.assertTrue(burning.getRemainingFireTicks() <= 0, "the cow still burns: " + burning.getRemainingFireTicks()));
        helper.runAfterDelay(80, () -> {
            helper.assertTrue(drowning.getHealth() < drowning.getMaxHealth() && damage(drowning).equals("drown"),
                    "the cow did not drown: " + drowning.getHealth() + " " + damage(drowning));
            helper.assertTrue(cow.hasEffect(MobEffects.GLOWING), "on_entity_inside gave the cow no glowing");
            helper.succeed();
        });
    }

    /** In molten amber a cow is in lava, set on fire and hurt by lava, and nobody is in water. */
    @GameTest(structure = ARENA, maxTicks = 60)
    public void moltenAmberIsLavaToEntities(GameTestHelper helper) {
        fill(helper, "molten_amber");
        Mob cow = still(helper, 5.5, 5.5);
        helper.runAfterDelay(20, () -> {
            helper.assertTrue(cow.isInLava() && !cow.isInWater(), "lava " + cow.isInLava() + ", water " + cow.isInWater());
            helper.assertTrue(cow.isOnFire(), "the cow does not burn");
            helper.assertTrue(cow.getHealth() < cow.getMaxHealth() && damage(cow).equals("lava"), "lava damage " + cow.getHealth() + " " + damage(cow));
            helper.assertFalse(cow.hasEffect(MobEffects.GLOWING), "molten amber made the cow glow");
            helper.succeed();
        });
    }
}
