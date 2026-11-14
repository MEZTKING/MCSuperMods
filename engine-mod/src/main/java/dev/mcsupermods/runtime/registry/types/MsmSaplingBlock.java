package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import dev.mcsupermods.runtime.registry.TreeGrowers;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SaplingBlock;
import net.minecraft.world.level.block.grower.TreeGrower;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A sapling ({@code type: "sapling"}, ADR 0068 D4): vanilla {@link SaplingBlock} with a {@link TreeGrower} made from the
 * definition's configured feature ids (version seam {@link TreeGrowers}). The keys are looked up in the server's
 * registries when the sapling grows, so a tree from any loaded data pack works; a missing tree is warned about once at
 * server start ({@code SaplingCheck}) and the sapling then does not grow, as vanilla. Two-by-two growth works when
 * {@code mega_tree} is set.
 */
public class MsmSaplingBlock extends SaplingBlock implements DrivenBlock {
    private final BlockBehaviourDriver driver;
    private final TagKey<Block> soil;
    private final BlockType.Sapling fields;

    public MsmSaplingBlock(Identifier id, BlockDefinition definition, Properties properties) {
        this(id, definition, (BlockType.Sapling) definition.typeFields(), properties);
    }

    private MsmSaplingBlock(Identifier id, BlockDefinition definition, BlockType.Sapling fields, Properties properties) {
        super(TreeGrowers.create(id.toString(), feature(fields.tree()), fields.megaTree().map(MsmSaplingBlock::feature),
                feature(fields.flowerTree())), properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.soil = TagKey.create(Registries.BLOCK, fields.soil());
        this.fields = fields;
    }

    private static ResourceKey<Feature> feature(Identifier id) {
        return ResourceKey.create(Registries.FEATURE, id);
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The grower built from the definition. */
    public TreeGrower treeGrower() {
        return treeGrower;
    }

    /** The definition's sapling fields ({@code tree}, {@code mega_tree}, {@code flower_tree}, {@code soil}). */
    public BlockType.Sapling saplingFields() {
        return fields;
    }

    @Override
    protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
        return state.is(soil);
    }

    // Events and triggers: delegated to the driver after vanilla's own behaviour (ADR 0067 D3, D4).

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        InteractionResult vanilla = super.useWithoutItem(state, level, pos, player, hit);
        InteractionResult own = driver.useWithoutItem(level, pos, player);
        return vanilla.consumesAction() ? vanilla : own;
    }

    @Override
    public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
        driver.stepOn(level, pos, entity);
        super.stepOn(level, pos, state, entity);
    }

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        driver.playerWillDestroy(level, pos, player);
        return super.playerWillDestroy(level, pos, state, player);
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        driver.setPlacedBy(level, pos, placer);
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        if (level.getBlockState(pos).is(this)) { // the sapling may have grown into a tree
            driver.randomTick(level, pos, random);
        }
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        driver.entityInside(level, pos, entity);
    }
}
