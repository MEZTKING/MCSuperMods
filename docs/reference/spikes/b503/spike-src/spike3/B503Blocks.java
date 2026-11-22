package dev.mcsupermods.runtime.gametest.spike3;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.BlockExtras;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.container.MsmContainerBlock;
import dev.mcsupermods.runtime.registry.types.MsmButtonBlock;
import dev.mcsupermods.runtime.registry.types.MsmFenceBlock;
import dev.mcsupermods.runtime.registry.types.MsmFenceGateBlock;
import dev.mcsupermods.runtime.registry.types.MsmPressurePlateBlock;
import dev.mcsupermods.runtime.registry.types.MsmRodBlock;
import dev.mcsupermods.runtime.registry.types.MsmWallBlock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.NonNullList;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Containers;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChangeOverTimeBlock;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.WeatheringCopper;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.WoodType;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/** B503 spike (throwaway): the block classes of X4, X6–X9 and X13. */
public final class B503Blocks {
    private B503Blocks() {}

    // X6, X13: copper-like ageing on more types, written as ADR 0094 D8's eleven (vanilla's ChangeOverTimeBlock decides).

    public interface Ages extends ChangeOverTimeBlock<WeatheringCopper.WeatherState> {
        Supplier<Block> nextBlock();

        WeatheringCopper.WeatherState age();

        @Override
        default Optional<BlockState> getNext(BlockState state) {
            Supplier<Block> n = nextBlock();
            return n == null ? Optional.empty() : Optional.of(BlockExtras.copyProperties(state, n.get().defaultBlockState()));
        }

        @Override
        default float getChanceModifier() {
            return age() == WeatheringCopper.WeatherState.UNAFFECTED ? 0.75f : 1.0f;
        }

        @Override
        default WeatheringCopper.WeatherState getAge() {
            return age();
        }
    }

    public static final class WRod extends MsmRodBlock implements Ages {
        private final Supplier<Block> next;
        private final WeatheringCopper.WeatherState age;

        public WRod(Identifier id, BlockDefinition d, WeatheringCopper.WeatherState age, Supplier<Block> next, Properties p) {
            super(id, d, p);
            this.age = age;
            this.next = next;
        }

        public Supplier<Block> nextBlock() { return next; }

        public WeatheringCopper.WeatherState age() { return age; }

        @Override
        protected boolean isRandomlyTicking(BlockState state) { return next != null; }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            changeOverTime(state, level, pos, random);
        }
    }

    public static final class WButton extends MsmButtonBlock implements Ages {
        private final Supplier<Block> next;
        private final WeatheringCopper.WeatherState age;

        public WButton(Identifier id, BlockDefinition d, BlockSetType t, WeatheringCopper.WeatherState age, Supplier<Block> next, Properties p) {
            super(id, d, t, 20, p);
            this.age = age;
            this.next = next;
        }

        public Supplier<Block> nextBlock() { return next; }

        public WeatheringCopper.WeatherState age() { return age; }

        @Override
        protected boolean isRandomlyTicking(BlockState state) { return next != null; }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            changeOverTime(state, level, pos, random);
        }
    }

    public static final class WPlate extends MsmPressurePlateBlock implements Ages {
        private final Supplier<Block> next;
        private final WeatheringCopper.WeatherState age;

        public WPlate(Identifier id, BlockDefinition d, BlockSetType t, WeatheringCopper.WeatherState age, Supplier<Block> next, Properties p) {
            super(id, d, t, p);
            this.age = age;
            this.next = next;
        }

        public Supplier<Block> nextBlock() { return next; }

        public WeatheringCopper.WeatherState age() { return age; }

        @Override
        protected boolean isRandomlyTicking(BlockState state) { return next != null; }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            changeOverTime(state, level, pos, random);
        }
    }

    public static final class WFence extends MsmFenceBlock implements Ages {
        private final Supplier<Block> next;
        private final WeatheringCopper.WeatherState age;

        public WFence(Identifier id, BlockDefinition d, WeatheringCopper.WeatherState age, Supplier<Block> next, Properties p) {
            super(id, d, p);
            this.age = age;
            this.next = next;
        }

        public Supplier<Block> nextBlock() { return next; }

        public WeatheringCopper.WeatherState age() { return age; }

        @Override
        protected boolean isRandomlyTicking(BlockState state) { return next != null; }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            changeOverTime(state, level, pos, random);
        }
    }

    public static final class WGate extends MsmFenceGateBlock implements Ages {
        private final Supplier<Block> next;
        private final WeatheringCopper.WeatherState age;

        public WGate(Identifier id, BlockDefinition d, WoodType w, WeatheringCopper.WeatherState age, Supplier<Block> next, Properties p) {
            super(id, d, w, p);
            this.age = age;
            this.next = next;
        }

        public Supplier<Block> nextBlock() { return next; }

        public WeatheringCopper.WeatherState age() { return age; }

        @Override
        protected boolean isRandomlyTicking(BlockState state) { return next != null; }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            changeOverTime(state, level, pos, random);
        }
    }

    public static final class WWall extends MsmWallBlock implements Ages {
        private final Supplier<Block> next;
        private final WeatheringCopper.WeatherState age;

        public WWall(Identifier id, BlockDefinition d, WeatheringCopper.WeatherState age, Supplier<Block> next, Properties p) {
            super(id, d, p);
            this.age = age;
            this.next = next;
        }

        public Supplier<Block> nextBlock() { return next; }

        public WeatheringCopper.WeatherState age() { return age; }

        @Override
        protected boolean isRandomlyTicking(BlockState state) { return next != null; }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            changeOverTime(state, level, pos, random);
        }
    }

    // X7: a container block that holds water (vanilla's SimpleWaterloggedBlock on the runtime's container class).

    public static class WetChest extends MsmContainerBlock implements SimpleWaterloggedBlock {
        public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;

        public WetChest(Identifier id, BlockDefinition d, Properties p) {
            super(id, d, MsmBlock.Setup.of(d), p);
            registerDefaultState(defaultBlockState().setValue(WATERLOGGED, false));
        }

        @Override
        protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
            super.createBlockStateDefinition(builder);
            builder.add(WATERLOGGED);
        }

        @Override
        public BlockState getStateForPlacement(BlockPlaceContext context) {
            BlockState state = super.getStateForPlacement(context);
            return state == null ? null
                    : state.setValue(WATERLOGGED, context.getLevel().getFluidState(context.getClickedPos()).getType() == Fluids.WATER);
        }

        @Override
        protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
                BlockPos neighbourPos, BlockState neighbourState, RandomSource random) {
            if (state.getValue(WATERLOGGED)) {
                ticks.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level));
            }
            return super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbourState, random);
        }

        @Override
        protected FluidState getFluidState(BlockState state) {
            return state.getValue(WATERLOGGED) ? Fluids.WATER.defaultFluidState() : super.getFluidState(state);
        }
    }

    // X13: a container that ages.

    public static final class AgingChest extends MsmContainerBlock implements Ages {
        private final Supplier<Block> next;
        private final WeatheringCopper.WeatherState age;

        public AgingChest(Identifier id, BlockDefinition d, WeatheringCopper.WeatherState age, Supplier<Block> next, Properties p) {
            super(id, d, MsmBlock.Setup.of(d), p);
            this.age = age;
            this.next = next;
        }

        public Supplier<Block> nextBlock() { return next; }

        public WeatheringCopper.WeatherState age() { return age; }

        @Override
        protected boolean isRandomlyTicking(BlockState state) { return next != null; }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            changeOverTime(state, level, pos, random);
        }
    }

    // X8: a double chest on vanilla's ChestBlock with its own block entity type and block models (no renderer).

    public static BlockEntityType<DChestEntity> dchestType;

    public static final class DChest extends ChestBlock {
        public DChest(Properties p) {
            super(() -> dchestType, net.minecraft.sounds.SoundEvents.CHEST_OPEN, net.minecraft.sounds.SoundEvents.CHEST_CLOSE, p);
        }

        @Override
        public net.minecraft.world.level.block.entity.BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
            return new DChestEntity(pos, state);
        }
    }

    public static final class DChestEntity extends ChestBlockEntity {
        public DChestEntity(BlockPos pos, BlockState state) {
            super(dchestType, pos, state);
        }
    }

    // X9: per-player storage kept in a Fabric attachment on the player, one store per block id.

    public static final class StoreBlock extends Block {
        public StoreBlock(Properties p) {
            super(p);
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            if (level instanceof ServerLevel) {
                String key = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(this).toString();
                PlayerStore store = new PlayerStore(player, key);
                player.openMenu(new SimpleMenuProvider((id, inv, p) -> ChestMenu.threeRows(id, inv, store), Component.literal("store")));
            }
            return InteractionResult.SUCCESS;
        }
    }

    public static final class PlayerStore extends SimpleContainer {
        private final Player player;
        private final String key;

        public PlayerStore(Player player, String key) {
            super(27);
            this.player = player;
            this.key = key;
            List<ItemStack> saved = player.getAttachedOrElse(B503Mod.STORE, Map.of()).getOrDefault(key, List.of());
            for (int i = 0; i < saved.size() && i < 27; i++) {
                setItem(i, saved.get(i).copy());
            }
        }

        @Override
        public void setChanged() {
            super.setChanged();
            Map<String, List<ItemStack>> all = new HashMap<>(player.getAttachedOrElse(B503Mod.STORE, Map.of()));
            List<ItemStack> items = new ArrayList<>();
            for (int i = 0; i < getContainerSize(); i++) {
                items.add(getItem(i).copy());
            }
            all.put(key, items);
            player.setAttached(B503Mod.STORE, all);
        }
    }

    // X4: a project empty pot with its own plant-to-pot map (never vanilla's FlowerPotBlock map).

    public static final Map<Block, Block> OWN_POTS = new HashMap<>();
    private static final VoxelShape POT_SHAPE = Block.box(5, 0, 5, 11, 6, 11);

    public static final class OwnPot extends Block {
        private final Supplier<Block> plant;
        private final Supplier<Block> empty;

        /** {@code plant} null: the empty pot. */
        public OwnPot(Properties p, Supplier<Block> plant, Supplier<Block> empty) {
            super(p);
            this.plant = plant;
            this.empty = empty;
        }

        @Override
        protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
            return POT_SHAPE;
        }

        @Override
        protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand,
                BlockHitResult hit) {
            if (plant != null) {
                return InteractionResult.TRY_WITH_EMPTY_HAND;
            }
            Block potted = stack.getItem() instanceof BlockItem bi ? OWN_POTS.get(bi.getBlock()) : null;
            if (potted == null) {
                return InteractionResult.CONSUME;
            }
            level.setBlock(pos, potted.defaultBlockState(), Block.UPDATE_ALL);
            stack.consume(1, player);
            return InteractionResult.SUCCESS;
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            if (plant == null) {
                return InteractionResult.CONSUME;
            }
            ItemStack back = new ItemStack(plant.get());
            if (!player.addItem(back)) {
                Block.popResource(level, pos, back);
            }
            level.setBlock(pos, empty.get().defaultBlockState(), Block.UPDATE_ALL);
            return InteractionResult.SUCCESS;
        }

        @Override
        protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean data) {
            return plant == null ? new ItemStack(this) : new ItemStack(plant.get());
        }
    }

    /** Drops what a container held (as vanilla's Containers.dropContents). */
    static void drop(Level level, BlockPos pos, NonNullList<ItemStack> items) {
        Containers.dropContents(level, pos, items);
    }

    static Block air() {
        return Blocks.AIR;
    }
}
