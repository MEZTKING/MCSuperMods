package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.types.Companions;
import dev.mcsupermods.runtime.registry.types.MsmAttachedStemBlock;
import dev.mcsupermods.runtime.registry.types.MsmBedBlock;
import dev.mcsupermods.runtime.registry.types.MsmCeilingHangingSignBlock;
import dev.mcsupermods.runtime.registry.types.MsmChainBlock;
import dev.mcsupermods.runtime.registry.types.MsmLadderBlock;
import dev.mcsupermods.runtime.registry.types.MsmLanternBlock;
import dev.mcsupermods.runtime.registry.types.MsmRodBlock;
import dev.mcsupermods.runtime.registry.types.MsmScaffoldingBlock;
import dev.mcsupermods.runtime.registry.types.MsmSignBlock;
import dev.mcsupermods.runtime.registry.types.MsmStemBlock;
import dev.mcsupermods.runtime.registry.types.MsmTorchBlock;
import dev.mcsupermods.runtime.registry.types.MsmWallHangingSignBlock;
import dev.mcsupermods.runtime.registry.types.MsmWallSignBlock;
import dev.mcsupermods.runtime.registry.types.MsmWallTorchBlock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.FilteredText;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.HangingSignItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.StandingAndWallBlockItem;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.AbstractBedBlock;
import net.minecraft.world.level.block.AttachedStemBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CeilingHangingSignBlock;
import net.minecraft.world.level.block.EndRodBlock;
import net.minecraft.world.level.block.LadderBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.ScaffoldingBlock;
import net.minecraft.world.level.block.SignBlock;
import net.minecraft.world.level.block.StemBlock;
import net.minecraft.world.level.block.WallHangingSignBlock;
import net.minecraft.world.level.block.WallSignBlock;
import net.minecraft.world.level.block.WallTorchBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTypes;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.level.block.entity.SignTextSlot;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the furniture, light, sign and stem block types bed, ladder, torch, lantern, chain, rod, sign,
 * hanging_sign, stem and scaffolding and their companions (ADR 0094 D1 to D6; B446) on
 * {@code msm/msm_test/block/furniture_*.json}. The test data pack adds {@code furniture_ladder} and
 * {@code furniture_scaffolding} to {@code #minecraft:climbable}, both beds to {@code #minecraft:beds} and the stem to
 * {@code #minecraft:maintains_farmland}, and has loot tables for the torch, the sign and their wall forms, as the lowering
 * writes them. Uses go through {@code ServerPlayerGameMode.useItemOn} with a mock player, as the network handler does;
 * sign text goes through {@code SignBlockEntity.updateSignText}, the call the sign update packet makes (a dedicated server
 * is not reachable from these tests).
 */
public class MsmFurnitureGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    /** A survival mock player standing in the test area, facing {@code yaw} (0 south, 90 west, 180 north, -90 east). */
    private static ServerPlayer player(GameTestHelper helper, float yaw) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(0.5, 2, 0.5)));
        player.setYRot(yaw);
        player.setYHeadRot(yaw);
        return player;
    }

    /** A right-click on {@code face} of the block at {@code rel} holding {@code stack}, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel, Direction face) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, new BlockHitResult(hitAt, face, abs, false));
    }

    /** The items dropped near {@code rel}, by id, removed from the world. */
    private static Map<String, Integer> collectDrops(GameTestHelper helper, BlockPos rel) {
        Map<String, Integer> found = new TreeMap<>();
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2))) {
            found.merge(BuiltInRegistries.ITEM.getKey(e.getItem().getItem()).toString(), e.getItem().getCount(), Integer::sum);
            e.discard();
        }
        return found;
    }

    private static String name(BlockState state) {
        return BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath();
    }

    private static ItemStack clone(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return helper.getLevel().getBlockState(abs).getCloneItemStack(helper.getLevel(), abs, false);
    }

    /** Records the {@code msm_test} event firings at depth 1. */
    private static final class Recorder implements EventListener, AutoCloseable {
        private final List<String> fired = Collections.synchronizedList(new ArrayList<>());

        Recorder() {
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getPath().startsWith("furniture_") && depth == 1) {
                fired.add(owner.getPath() + " " + event.getPath());
            }
        }

        List<String> fired() {
            synchronized (fired) {
                return List.copyOf(fired);
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    // Registration

    @GameTest
    public void furnitureTypesRegisterTheirClassesItemsAndCompanions(GameTestHelper helper) {
        helper.assertTrue(block("furniture_bed") instanceof MsmBedBlock, "bed");
        helper.assertValueEqual(((MsmBedBlock) block("furniture_bed")).getColor(), DyeColor.RED, "bed colour");
        helper.assertValueEqual(((MsmBedBlock) block("furniture_bed_straw")).getColor(), DyeColor.WHITE, "default bed colour");
        helper.assertTrue(block("furniture_ladder") instanceof MsmLadderBlock, "ladder");
        helper.assertTrue(block("furniture_torch") instanceof MsmTorchBlock, "torch");
        helper.assertTrue(block("furniture_torch_wall") instanceof MsmWallTorchBlock, "wall torch");
        helper.assertTrue(block("furniture_lantern") instanceof MsmLanternBlock, "lantern");
        helper.assertTrue(block("furniture_chain") instanceof MsmChainBlock, "chain");
        helper.assertTrue(block("furniture_rod") instanceof MsmRodBlock, "rod");
        helper.assertTrue(block("furniture_sign") instanceof MsmSignBlock, "sign");
        helper.assertTrue(block("furniture_sign_wall") instanceof MsmWallSignBlock, "wall sign");
        helper.assertTrue(block("furniture_hanging_sign") instanceof MsmCeilingHangingSignBlock, "hanging sign");
        helper.assertTrue(block("furniture_hanging_sign_wall") instanceof MsmWallHangingSignBlock, "wall hanging sign");
        helper.assertTrue(block("furniture_stem") instanceof MsmStemBlock, "stem");
        helper.assertTrue(block("furniture_stem_attached") instanceof MsmAttachedStemBlock, "attached stem");
        helper.assertTrue(block("furniture_scaffolding") instanceof MsmScaffoldingBlock, "scaffolding");
        helper.assertTrue(Companions.companionOf(block("furniture_torch")).orElseThrow() == block("furniture_torch_wall"), "torch companion");
        helper.assertTrue(Companions.companionOf(block("furniture_ladder")).isEmpty(), "a ladder has no companion");
        // Items: the vanilla classes, default stack sizes, and the companions give the element's item.
        helper.assertTrue(item("furniture_torch") instanceof StandingAndWallBlockItem, "torch item");
        helper.assertTrue(item("furniture_sign") instanceof StandingAndWallBlockItem, "sign item");
        helper.assertTrue(item("furniture_hanging_sign") instanceof HangingSignItem, "hanging sign item");
        helper.assertTrue(item("furniture_scaffolding") instanceof MsmScaffoldingBlock.PlacingItem, "scaffolding item");
        helper.assertTrue(item("furniture_bed") instanceof BlockItem, "bed item");
        helper.assertValueEqual(item("furniture_sign").getDefaultMaxStackSize(), 16, "sign stack");
        helper.assertValueEqual(item("furniture_hanging_sign").getDefaultMaxStackSize(), 16, "hanging sign stack");
        helper.assertValueEqual(item("furniture_bed").getDefaultMaxStackSize(), 1, "bed stack");
        helper.assertValueEqual(item("furniture_torch").getDefaultMaxStackSize(), 64, "torch stack");
        helper.assertTrue(item("furniture_seeds") instanceof BlockItem seeds && seeds.getBlock() == block("furniture_stem"), "the stem's seeds");
        for (String companion : List.of("furniture_torch_wall", "furniture_sign_wall", "furniture_hanging_sign_wall", "furniture_stem_attached")) {
            helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id(companion)), companion + " has an item of its own");
        }
        helper.assertTrue(block("furniture_torch_wall").asItem() == item("furniture_torch"), "the wall torch's item");
        helper.assertTrue(block("furniture_sign_wall").asItem() == item("furniture_sign"), "the wall sign's item");
        helper.assertTrue(block("furniture_hanging_sign_wall").asItem() == item("furniture_hanging_sign"), "the wall hanging sign's item");
        // Companions copy the element's properties and keep their own loot table id.
        helper.assertValueEqual(block("furniture_torch_wall").getLootTable().orElseThrow().identifier(), id("blocks/furniture_torch_wall"),
                "the wall torch's loot table");
        helper.assertValueEqual(block("furniture_stem_attached").getLootTable().orElseThrow().identifier(), id("blocks/furniture_stem_attached"),
                "the attached stem's loot table");
        // Light: vanilla's unless msm:light_emitter says otherwise.
        helper.assertValueEqual(block("furniture_torch").defaultBlockState().getLightEmission(), 14, "torch light");
        helper.assertValueEqual(block("furniture_torch_wall").defaultBlockState().getLightEmission(), 14, "wall torch light");
        helper.assertValueEqual(block("furniture_torch_soul").defaultBlockState().getLightEmission(), 10, "torch with light_emitter");
        helper.assertValueEqual(block("furniture_torch_soul_wall").defaultBlockState().getLightEmission(), 10, "its wall form");
        helper.assertValueEqual(block("furniture_lantern").defaultBlockState().getLightEmission(), 15, "lantern light");
        helper.assertValueEqual(block("furniture_rod").defaultBlockState().getLightEmission(), 14, "rod light");
        helper.assertValueEqual(block("furniture_chain").defaultBlockState().getLightEmission(), 0, "chain light");
        // Particles: the definition's, or the flame with a warning when it takes options.
        helper.assertTrue(((MsmTorchBlock) block("furniture_torch")).particle() == ParticleTypes.FLAME, "default particle");
        helper.assertTrue(((MsmTorchBlock) block("furniture_torch_soul")).particle() == ParticleTypes.SOUL_FIRE_FLAME, "soul particle");
        helper.assertTrue(((MsmTorchBlock) block("furniture_torch_dust")).particle() == ParticleTypes.FLAME, "dust falls back to flame");
        // Signs: their own unregistered wood type, valid blocks of vanilla's sign block entity types.
        helper.assertValueEqual(SignBlock.getWoodType(block("furniture_sign")).name(), "msm_test:furniture_sign", "sign wood type");
        helper.assertValueEqual(SignBlock.getWoodType(block("furniture_sign_wall")).name(), "msm_test:furniture_sign", "wall sign wood type");
        helper.assertValueEqual(SignBlock.getWoodType(block("furniture_hanging_sign")).name(), "msm_test:furniture_hanging_sign",
                "hanging sign wood type");
        for (String sign : List.of("furniture_sign", "furniture_sign_wall")) {
            helper.assertTrue(BlockEntityTypes.SIGN.isValid(block(sign).defaultBlockState()), sign + " is not a valid sign");
        }
        for (String sign : List.of("furniture_hanging_sign", "furniture_hanging_sign_wall")) {
            helper.assertTrue(BlockEntityTypes.HANGING_SIGN.isValid(block(sign).defaultBlockState()), sign + " is not a valid hanging sign");
        }
        // Load problems: the dust particle is a warning; the clash is an error naming the generated id; nothing else.
        List<String> warnings = MsmRuntime.report().warnings().stream().filter(w -> w.contains("/furniture_")).toList();
        helper.assertValueEqual(warnings.size(), 1, "furniture warnings: " + warnings);
        helper.assertTrue(warnings.getFirst().contains("furniture_torch_dust.json") && warnings.getFirst().contains("minecraft:dust"),
                "the dust warning: " + warnings);
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/furniture_")).toList();
        helper.assertValueEqual(errors.size(), 1, "furniture errors: " + errors);
        helper.assertTrue(errors.getFirst().contains("furniture_clash"), "the clash error: " + errors);
        String seam = FurnitureSeamCheck.problem((SignBlock) block("furniture_sign"), Blocks.SPRUCE_SIGN,
                (SignBlock) block("furniture_hanging_sign"), Blocks.CHERRY_HANGING_SIGN);
        helper.assertTrue(seam == null, String.valueOf(seam));
        helper.succeed();
    }

    // Bed

    @GameTest(maxTicks = 100)
    public void bedPlacesBothHalvesSleepsAndSetsSpawn(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerPlayer player = player(helper, 0); // facing south
        BlockPos floor = new BlockPos(2, 1, 1);
        helper.setBlock(floor, Blocks.STONE);
        helper.setBlock(floor.south(), Blocks.STONE);
        InteractionResult placed = use(helper, player, new ItemStack(item("furniture_bed")), floor, Direction.UP);
        helper.assertTrue(placed.consumesAction(), "bed placement: " + placed);
        BlockPos foot = floor.above();
        BlockPos head = foot.south();
        helper.assertValueEqual(helper.getBlockState(foot).getValue(AbstractBedBlock.PART), BedPart.FOOT, "foot");
        helper.assertValueEqual(helper.getBlockState(head).getValue(AbstractBedBlock.PART), BedPart.HEAD, "head");
        helper.assertValueEqual(name(helper.getBlockState(head)), "furniture_bed", "head block");
        helper.assertTrue(clone(helper, head).is(item("furniture_bed")), "pick block on the bed");
        helper.assertValueEqual(((AbstractBedBlock) block("furniture_bed")).getBedRule(level, helper.absolutePos(head)).canSetSpawn(level),
                true, "the overworld's bed rule sets spawn");
        level.getServer().getCommands().performPrefixedCommand(level.getServer().createCommandSourceStack(), "time set midnight");
        helper.runAfterDelay(5, () -> {
            player.setPos(helper.absoluteVec(Vec3.atBottomCenterOf(foot.west())));
            player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            try (Recorder r = new Recorder()) {
                BlockPos abs = helper.absolutePos(head);
                InteractionResult used = level.getBlockState(abs).useWithoutItem(level, player,
                        new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false));
                helper.assertTrue(used.consumesAction(), "bed use: " + used);
                helper.assertTrue(r.fired().contains("furniture_bed furniture_used"), "on_interact after sleeping: " + r.fired());
            }
            helper.assertTrue(player.isSleeping(), "not sleeping at midnight: " + player.getSleepingPos());
            helper.assertValueEqual(player.getSleepingPos().orElseThrow(), helper.absolutePos(head), "sleeping at the head");
            helper.assertTrue(player.getRespawnConfig() != null
                    && player.getRespawnConfig().respawnData().pos().equals(helper.absolutePos(head)), "spawn not set: " + player.getRespawnConfig());
            helper.assertTrue(helper.getBlockState(head).getValue(AbstractBedBlock.OCCUPIED), "the bed is not occupied");
            player.stopSleepInBed(true, true);
            level.getServer().getCommands().performPrefixedCommand(level.getServer().createCommandSourceStack(), "time set noon");
            // Breaking either half takes both; the foot drops nothing in survival (vanilla's head-only drop is the loot table's).
            level.destroyBlock(helper.absolutePos(foot), false, player);
            helper.assertTrue(helper.getBlockState(head).isAir(), "the head stayed: " + helper.getBlockState(head));
            helper.succeed();
        });
    }

    @GameTest
    public void bedExplodesWhereItsRuleSays(GameTestHelper helper) {
        ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
        BlockPos foot = new BlockPos(9_472, 80, -9_472);
        BlockPos head = foot.south();
        nether.getChunk(foot);
        nether.getChunk(head);
        AbstractBedBlock bed = (AbstractBedBlock) block("furniture_bed");
        helper.assertTrue(bed.getBedRule(nether, head).destroyOnUse(), "the Nether's bed rule does not destroy on use");
        AbstractBedBlock straw = (AbstractBedBlock) block("furniture_bed_straw");
        String strawRule = straw.getBedRule(nether, head).toString();
        BlockState footState = bed.defaultBlockState().setValue(AbstractBedBlock.FACING, Direction.SOUTH).setValue(AbstractBedBlock.PART, BedPart.FOOT);
        nether.setBlock(foot.below(), Blocks.NETHERRACK.defaultBlockState(), Block.UPDATE_ALL);
        nether.setBlock(head.below(), Blocks.NETHERRACK.defaultBlockState(), Block.UPDATE_ALL);
        nether.setBlock(foot, footState, Block.UPDATE_ALL);
        nether.setBlock(head, footState.setValue(AbstractBedBlock.PART, BedPart.HEAD), Block.UPDATE_ALL);
        ServerPlayer player = player(helper, 0);
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        InteractionResult used = nether.getBlockState(head).useWithoutItem(nether, player, new BlockHitResult(Vec3.atCenterOf(head), Direction.UP,
                head, false));
        helper.assertTrue(used.consumesAction(), "bed use in the Nether: " + used);
        helper.assertTrue(nether.getBlockState(head).isAir() && nether.getBlockState(foot).isAir(),
                "the bed did not blow up: " + nether.getBlockState(head) + " / " + nether.getBlockState(foot));
        helper.assertFalse(player.isSleeping(), "slept in the Nether");
        helper.assertTrue(strawRule.contains("BedRule"), "straw rule: " + strawRule);
        helper.succeed();
    }

    // Ladder and scaffolding climbing

    @GameTest(maxTicks = 100)
    public void ladderHangsOnAWallAndIsClimbed(GameTestHelper helper) {
        ServerPlayer player = player(helper, 180);
        BlockPos wall = new BlockPos(2, 2, 3);
        helper.setBlock(wall, Blocks.STONE);
        helper.setBlock(wall.below(), Blocks.STONE);
        InteractionResult placed = use(helper, player, new ItemStack(item("furniture_ladder")), wall, Direction.NORTH);
        helper.assertTrue(placed.consumesAction(), "ladder placement: " + placed);
        BlockPos ladder = wall.north();
        helper.assertValueEqual(helper.getBlockState(ladder).getValue(LadderBlock.FACING), Direction.NORTH, "ladder facing");
        Zombie climber = helper.spawn(EntityTypes.ZOMBIE, ladder);
        climber.setNoAi(true);
        helper.succeedWhen(() -> {
            helper.assertTrue(climber.onClimbable(), "not climbing the ladder at " + climber.blockPosition());
            // Without its wall the ladder pops off.
            helper.getLevel().setBlock(helper.absolutePos(wall), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
            helper.assertTrue(helper.getBlockState(ladder).isAir(), "the ladder stayed without a wall");
            climber.discard();
        });
    }

    @GameTest(maxTicks = 200)
    public void scaffoldingCountsItsOwnDistanceAndBuildsWithItsItem(GameTestHelper helper) {
        ServerPlayer player = player(helper, -90); // facing east
        Block scaffolding = block("furniture_scaffolding");
        BlockPos floor = new BlockPos(1, 1, 2);
        helper.setBlock(floor, Blocks.STONE);
        InteractionResult base = use(helper, player, new ItemStack(item("furniture_scaffolding"), 16), floor, Direction.UP);
        helper.assertTrue(base.consumesAction(), "base placement: " + base);
        BlockPos at = floor.above();
        helper.assertValueEqual(helper.getBlockState(at).getValue(ScaffoldingBlock.DISTANCE), 0, "base distance");
        // The top face builds a row in the facing direction: distances 1 to 6, then no more.
        for (int n = 1; n <= 6; n++) {
            InteractionResult r = use(helper, player, new ItemStack(item("furniture_scaffolding"), 16), at, Direction.UP);
            helper.assertTrue(r.consumesAction(), "row " + n + ": " + r);
            BlockState s = helper.getBlockState(at.east(n));
            helper.assertTrue(s.is(scaffolding), "row " + n + " not placed: " + s);
            helper.assertValueEqual(s.getValue(ScaffoldingBlock.DISTANCE), n, "row " + n + " distance");
            helper.assertTrue(s.getValue(ScaffoldingBlock.BOTTOM), "row " + n + " bottom");
        }
        InteractionResult tooFar = use(helper, player, new ItemStack(item("furniture_scaffolding"), 16), at, Direction.UP);
        helper.assertFalse(tooFar.consumesAction() && helper.getBlockState(at.east(7)).is(scaffolding), "a seventh in the row: " + tooFar);
        // A side face builds up the column, which takes the distance of the block below.
        InteractionResult up = use(helper, player, new ItemStack(item("furniture_scaffolding"), 16), at, Direction.NORTH);
        helper.assertTrue(up.consumesAction(), "column: " + up);
        helper.assertTrue(helper.getBlockState(at.above()).is(scaffolding), "the column did not grow");
        helper.assertValueEqual(helper.getBlockState(at.above()).getValue(ScaffoldingBlock.DISTANCE), 0, "column distance");
        helper.assertTrue(clone(helper, at).is(item("furniture_scaffolding")), "pick block on scaffolding");
        // Vanilla's scaffolding does not count ours (and ours does not count vanilla's).
        helper.assertValueEqual(((MsmScaffoldingBlock) scaffolding).distance(helper.getLevel(), helper.absolutePos(at.east(1))), 1, "own count");
        Zombie climber = helper.spawn(EntityTypes.ZOMBIE, at.above());
        climber.setNoAi(true);
        helper.runAfterDelay(5, () -> {
            helper.assertTrue(climber.onClimbable(), "not climbing the scaffolding at " + climber.blockPosition());
            climber.discard();
            // Without its support the whole frame comes down.
            helper.getLevel().setBlock(helper.absolutePos(floor), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
            helper.succeedWhen(() -> {
                for (int n = 0; n <= 6; n++) {
                    helper.assertFalse(helper.getBlockState(at.east(n)).is(scaffolding), "row " + n + " stayed");
                }
                helper.assertFalse(helper.getBlockState(at.above()).is(scaffolding), "the column stayed");
            });
        });
    }

    // Torch

    @GameTest
    public void torchPlacesStandingOrOnAWallAndDropsItsItem(GameTestHelper helper) {
        ServerPlayer player = player(helper, 180);
        BlockPos wall = new BlockPos(2, 2, 3);
        helper.setBlock(wall, Blocks.STONE);
        helper.setBlock(new BlockPos(1, 1, 1), Blocks.STONE);
        InteractionResult top = use(helper, player, new ItemStack(item("furniture_torch"), 4), new BlockPos(1, 1, 1), Direction.UP);
        helper.assertTrue(top.consumesAction(), "top: " + top);
        helper.assertValueEqual(name(helper.getBlockState(new BlockPos(1, 2, 1))), "furniture_torch", "standing torch");
        InteractionResult side = use(helper, player, new ItemStack(item("furniture_torch"), 4), wall, Direction.NORTH);
        helper.assertTrue(side.consumesAction(), "side: " + side);
        BlockState wallTorch = helper.getBlockState(wall.north());
        helper.assertValueEqual(name(wallTorch), "furniture_torch_wall", "wall torch");
        helper.assertValueEqual(wallTorch.getValue(WallTorchBlock.FACING), Direction.NORTH, "wall torch facing");
        helper.assertTrue(clone(helper, wall.north()).is(item("furniture_torch")), "pick block on the wall torch");
        // The wall form has the element's events.
        try (Recorder r = new Recorder()) {
            player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            BlockPos abs = helper.absolutePos(wall.north());
            helper.getLevel().getBlockState(abs).useWithoutItem(helper.getLevel(), player, new BlockHitResult(Vec3.atCenterOf(abs),
                    Direction.NORTH, abs, false));
            helper.assertTrue(r.fired().contains("furniture_torch furniture_used"), "on_interact on the wall torch: " + r.fired());
        }
        // Both forms drop the torch item (the lowering's loot tables).
        helper.getLevel().destroyBlock(helper.absolutePos(wall.north()), true);
        helper.assertValueEqual(collectDrops(helper, wall.north()), Map.of("msm_test:furniture_torch", 1), "wall torch drops");
        // Without its block the torch pops off.
        helper.getLevel().setBlock(helper.absolutePos(new BlockPos(1, 1, 1)), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
        helper.assertTrue(helper.getBlockState(new BlockPos(1, 2, 1)).isAir(), "the torch stayed without support");
        helper.assertValueEqual(collectDrops(helper, new BlockPos(1, 2, 1)), Map.of("msm_test:furniture_torch", 1), "torch drops");
        helper.succeed();
    }

    // Lantern, chain, rod

    @GameTest
    public void lanternHangsChainTakesTheAxisRodTheFace(GameTestHelper helper) {
        ServerPlayer player = player(helper, 180);
        BlockPos ceiling = new BlockPos(1, 4, 1);
        helper.setBlock(ceiling, Blocks.STONE);
        helper.setBlock(new BlockPos(3, 1, 1), Blocks.STONE);
        InteractionResult hung = use(helper, player, new ItemStack(item("furniture_lantern")), ceiling, Direction.DOWN);
        helper.assertTrue(hung.consumesAction(), "hanging lantern: " + hung);
        helper.assertTrue(helper.getBlockState(ceiling.below()).getValue(LanternBlock.HANGING), "the lantern does not hang");
        InteractionResult stands = use(helper, player, new ItemStack(item("furniture_lantern")), new BlockPos(3, 1, 1), Direction.UP);
        helper.assertTrue(stands.consumesAction(), "standing lantern: " + stands);
        helper.assertFalse(helper.getBlockState(new BlockPos(3, 2, 1)).getValue(LanternBlock.HANGING), "the standing lantern hangs");
        helper.getLevel().setBlock(helper.absolutePos(ceiling), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
        helper.assertTrue(helper.getBlockState(ceiling.below()).isAir(), "the hanging lantern stayed without its ceiling");
        BlockPos side = new BlockPos(5, 2, 2);
        helper.setBlock(side, Blocks.STONE);
        InteractionResult chain = use(helper, player, new ItemStack(item("furniture_chain")), side, Direction.WEST);
        helper.assertTrue(chain.consumesAction(), "chain: " + chain);
        helper.assertValueEqual(helper.getBlockState(side.west()).getValue(RotatedPillarBlock.AXIS), Direction.Axis.X, "chain axis");
        InteractionResult rod = use(helper, player, new ItemStack(item("furniture_rod")), side, Direction.NORTH);
        helper.assertTrue(rod.consumesAction(), "rod: " + rod);
        helper.assertValueEqual(helper.getBlockState(side.north()).getValue(EndRodBlock.FACING), Direction.NORTH, "rod facing");
        helper.succeed();
    }

    // Signs

    @GameTest
    public void signTextIsSetByThePlayerAndSaved(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerPlayer player = player(helper, 0); // facing south, towards the sign: its front faces the player
        BlockPos floor = new BlockPos(1, 1, 2);
        helper.setBlock(floor, Blocks.STONE);
        InteractionResult placed = use(helper, player, new ItemStack(item("furniture_sign"), 4), floor, Direction.UP);
        helper.assertTrue(placed.consumesAction(), "sign placement: " + placed);
        BlockPos at = floor.above();
        helper.assertValueEqual(name(helper.getBlockState(at)), "furniture_sign", "standing sign");
        BlockEntity be = level.getBlockEntity(helper.absolutePos(at));
        helper.assertTrue(be instanceof SignBlockEntity && be.getType() == BlockEntityTypes.SIGN, "sign block entity: " + be);
        SignBlockEntity sign = (SignBlockEntity) be;
        helper.assertValueEqual(sign.getPlayerWhoMayEdit(), player.getUUID(), "placing opens the editor for the placer");
        sign.updateSignText(player, SignTextSlot.FRONT, List.of(FilteredText.passThrough("Hello"), FilteredText.passThrough("from"),
                FilteredText.passThrough("a project"), FilteredText.passThrough("sign")));
        helper.assertValueEqual(sign.getText(SignTextSlot.FRONT).getMessages(false).get(0).getString(), "Hello", "line 1");
        // Dye and glow ink and wax: vanilla's uses on the sign.
        use(helper, player, new ItemStack(Items.DYE.red()), at, Direction.NORTH);
        helper.assertValueEqual(sign.getText(SignTextSlot.FRONT).getColor(), DyeColor.RED, "dyed");
        use(helper, player, new ItemStack(Items.GLOW_INK_SAC), at, Direction.NORTH);
        helper.assertTrue(sign.getText(SignTextSlot.FRONT).hasGlowingText(), "glowing");
        use(helper, player, new ItemStack(Items.HONEYCOMB), at, Direction.NORTH);
        helper.assertTrue(sign.isWaxed(), "waxed");
        // Saved and loaded again.
        CompoundTag saved = sign.saveWithFullMetadata(level.registryAccess());
        BlockEntity loaded = BlockEntity.loadStatic(helper.absolutePos(at), helper.getBlockState(at), saved, level.registryAccess());
        helper.assertTrue(loaded instanceof SignBlockEntity, "loaded: " + loaded);
        SignBlockEntity again = (SignBlockEntity) loaded;
        helper.assertValueEqual(again.getText(SignTextSlot.FRONT).getMessages(false).get(3).getString(), "sign", "line 4 after loading");
        helper.assertValueEqual(again.getText(SignTextSlot.FRONT).getColor(), DyeColor.RED, "colour after loading");
        helper.assertTrue(again.isWaxed(), "wax after loading");
        // The wall form, its block entity and its drop.
        BlockPos wall = new BlockPos(3, 2, 3);
        helper.setBlock(wall, Blocks.STONE);
        InteractionResult side = use(helper, player, new ItemStack(item("furniture_sign"), 4), wall, Direction.NORTH);
        helper.assertTrue(side.consumesAction(), "wall sign placement: " + side);
        BlockState wallSign = helper.getBlockState(wall.north());
        helper.assertValueEqual(name(wallSign), "furniture_sign_wall", "wall sign");
        helper.assertValueEqual(wallSign.getValue(WallSignBlock.FACING), Direction.NORTH, "wall sign facing");
        helper.assertTrue(level.getBlockEntity(helper.absolutePos(wall.north())) instanceof SignBlockEntity, "wall sign block entity");
        level.destroyBlock(helper.absolutePos(wall.north()), true);
        helper.assertValueEqual(collectDrops(helper, wall.north()), Map.of("msm_test:furniture_sign", 1), "wall sign drops");
        helper.succeed();
    }

    @GameTest
    public void hangingSignHangsUnderABlockOrFromAWall(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerPlayer player = player(helper, 180);
        BlockPos ceiling = new BlockPos(1, 4, 2);
        helper.setBlock(ceiling, Blocks.STONE);
        InteractionResult hung = use(helper, player, new ItemStack(item("furniture_hanging_sign"), 4), ceiling, Direction.DOWN);
        helper.assertTrue(hung.consumesAction(), "hanging sign: " + hung);
        BlockState under = helper.getBlockState(ceiling.below());
        helper.assertValueEqual(name(under), "furniture_hanging_sign", "ceiling hanging sign");
        helper.assertTrue(under.hasProperty(CeilingHangingSignBlock.ATTACHED), "attached state");
        BlockEntity be = level.getBlockEntity(helper.absolutePos(ceiling.below()));
        helper.assertTrue(be != null && be.getType() == BlockEntityTypes.HANGING_SIGN, "hanging sign block entity: " + be);
        BlockPos wall = new BlockPos(3, 3, 3);
        helper.setBlock(wall, Blocks.STONE);
        InteractionResult side = use(helper, player, new ItemStack(item("furniture_hanging_sign"), 4), wall, Direction.NORTH);
        helper.assertTrue(side.consumesAction(), "wall hanging sign: " + side);
        BlockState wallSign = helper.getBlockState(wall.north());
        helper.assertValueEqual(name(wallSign), "furniture_hanging_sign_wall", "wall hanging sign");
        helper.assertTrue(wallSign.getValue(WallHangingSignBlock.FACING).getAxis() == Direction.Axis.X, "wall hanging sign faces along the wall: "
                + wallSign);
        // Without its ceiling the hanging sign breaks.
        level.setBlock(helper.absolutePos(ceiling), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
        helper.assertTrue(helper.getBlockState(ceiling.below()).isAir(), "the hanging sign stayed without a ceiling");
        helper.succeed();
    }

    // Stem

    @GameTest(maxTicks = 100)
    public void stemGrowsItsFruitAndAttaches(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at.below(), Blocks.FARMLAND);
        for (Direction d : Direction.Plane.HORIZONTAL) {
            helper.setBlock(at.relative(d).below(), d == Direction.EAST ? Blocks.DIRT : Blocks.STONE);
            if (d != Direction.EAST) {
                helper.setBlock(at.relative(d), Blocks.STONE);
            }
        }
        BlockState young = block("furniture_stem").defaultBlockState();
        helper.assertTrue(young.canSurvive(level, helper.absolutePos(at)), "the stem cannot stand on farmland");
        helper.setBlock(at.below(), Blocks.STONE);
        helper.assertFalse(young.canSurvive(level, helper.absolutePos(at)), "the stem stands on stone");
        helper.setBlock(at.below(), Blocks.FARMLAND);
        helper.setBlock(at, young.setValue(StemBlock.AGE, StemBlock.MAX_AGE));
        helper.assertTrue(clone(helper, at).is(item("furniture_seeds")), "pick block on the stem: " + clone(helper, at));
        RandomSource random = RandomSource.create(446L);
        BlockPos abs = helper.absolutePos(at);
        for (int n = 0; n < 400 && level.getBlockState(abs).is(block("furniture_stem")); n++) {
            level.getBlockState(abs).randomTick(level, abs, random);
        }
        BlockState attached = level.getBlockState(abs);
        helper.assertValueEqual(name(attached), "furniture_stem_attached", "the stem did not attach");
        helper.assertValueEqual(attached.getValue(AttachedStemBlock.FACING), Direction.EAST, "attached facing");
        helper.assertValueEqual(name(helper.getBlockState(at.east())), "furniture_fruit", "the fruit");
        helper.assertTrue(clone(helper, at).is(item("furniture_seeds")), "pick block on the attached stem");
        // Taking the fruit turns it back into a full-grown stem.
        level.setBlock(helper.absolutePos(at.east()), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
        BlockState back = level.getBlockState(abs);
        helper.assertTrue(back.is(block("furniture_stem")) && back.getValue(StemBlock.AGE) == StemBlock.MAX_AGE, "after the fruit: " + back);
        helper.succeed();
    }

    // The generated id clash and the item of a companion

    @GameTest
    public void aClashingGeneratedIdIsALoadError(GameTestHelper helper) {
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("furniture_clash")).toList();
        helper.assertValueEqual(errors.size(), 1, "clash errors: " + errors);
        helper.assertTrue(errors.getFirst().contains("msm_test:furniture_clash_wall"), "the error names the generated id: " + errors);
        helper.assertTrue(block("furniture_clash") instanceof MsmTorchBlock, "the torch registered");
        helper.assertTrue(block("furniture_clash_wall") instanceof MsmWallTorchBlock, "the wall torch took its generated id");
        helper.succeed();
    }
}
