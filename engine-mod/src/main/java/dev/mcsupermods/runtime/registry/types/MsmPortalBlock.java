package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import dev.mcsupermods.runtime.registry.portal.PortalFrame;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Portal;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A portal block ({@code type: "portal"}, ADR 0077 D4), written from the ADR's rules: state {@link #AXIS}, a thin shape
 * along the axis and no collision (the registrar's properties), turned to air when the frame around it (D2) is no longer
 * whole; entities inside are handed to vanilla's portal processing through {@link Portal}. Lighting is
 * {@code registry/portal/PortalLighting} (D3); travel is B336.
 */
public class MsmPortalBlock extends Block implements Portal, DrivenBlock {
    public static final EnumProperty<Direction.Axis> AXIS = BlockStateProperties.HORIZONTAL_AXIS;
    /** Light when {@code msm:light_emitter} is absent (ADR 0077 D1, the Nether portal's). */
    public static final int DEFAULT_LIGHT = 11;
    /** About one ambient sound in this many animation ticks (ADR 0077 D4). */
    public static final int AMBIENT_ONE_IN = 100;

    /** 4 pixels thick, centred, spanning the block along the axis. */
    private static final VoxelShape SHAPE_X = Block.box(0, 0, 6, 16, 16, 10);
    private static final VoxelShape SHAPE_Z = Block.box(6, 0, 0, 10, 16, 16);

    private final BlockBehaviourDriver driver;
    private final BlockType.Portal portal;
    private final ParticleOptions particle;
    private final SoundEvent ambient;
    private final TagKey<Block> frameTag;
    private final TagKey<Item> igniterTag;

    public MsmPortalBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.portal = (BlockType.Portal) definition.typeFields();
        this.particle = particle(portal.particles()).orElse(ParticleTypes.PORTAL);
        this.ambient = portal.sounds().ambient().off() ? null
                : portal.sounds().ambient().sound().map(s -> BuiltInRegistries.SOUND_EVENT.getOptional(s).orElse(null))
                        .orElse(SoundEvents.PORTAL_AMBIENT);
        this.frameTag = portal.frame().tag() ? TagKey.create(Registries.BLOCK, portal.frame().id()) : null;
        this.igniterTag = portal.igniter().filter(BlockType.IdOrTag::tag).map(t -> TagKey.create(Registries.ITEM, t.id())).orElse(null);
        registerDefaultState(stateDefinition.any().setValue(AXIS, Direction.Axis.X));
    }

    /**
     * The particle of {@code particles}: dust of {@code color} when set, else {@code type} when it is a particle type
     * without options, else the target's portal particle (absent {@code type}). Empty when {@code type} is unknown or
     * takes options (a load error: the default particle is used).
     */
    public static Optional<ParticleOptions> particle(BlockType.PortalParticles particles) {
        if (particles.color().isPresent()) {
            return Optional.of(new DustParticleOptions(particles.color().get(), 1.0f));
        }
        if (particles.type().isEmpty()) {
            return Optional.of(ParticleTypes.PORTAL);
        }
        Identifier type = particles.type().get();
        if (BuiltInRegistries.PARTICLE_TYPE.containsKey(type) && BuiltInRegistries.PARTICLE_TYPE.getValue(type) instanceof SimpleParticleType simple) {
            return Optional.of(simple);
        }
        return Optional.empty();
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The definition's portal fields. */
    public BlockType.Portal portal() {
        return portal;
    }

    /** The particle {@link #animateTick} spawns. */
    public ParticleOptions particle() {
        return particle;
    }

    /** The ambient sound, or null for none. */
    public SoundEvent ambientSound() {
        return ambient;
    }

    /** Whether {@code state} is a frame block: the {@code frame} block, or a block in the {@code frame} tag (read now). */
    public boolean isFrame(BlockState state) {
        if (frameTag != null) {
            return state.is(frameTag);
        }
        Optional<Block> frame = BuiltInRegistries.BLOCK.getOptional(portal.frame().id());
        return frame.isPresent() && frame.get() != Blocks.AIR && state.is(frame.get());
    }

    /** Whether {@code stack} is this portal's igniter (never with {@code igniter: false}). */
    public boolean isIgniter(ItemStack stack) {
        if (stack.isEmpty() || portal.igniter().isEmpty()) {
            return false;
        }
        if (igniterTag != null) {
            return stack.is(igniterTag);
        }
        return BuiltInRegistries.ITEM.getKey(stack.getItem()).equals(portal.igniter().get().id());
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(AXIS);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return state.getValue(AXIS) == Direction.Axis.Z ? SHAPE_Z : SHAPE_X;
    }

    /**
     * A change beside the portal along its axis, or above or below it, turns it to air unless the frame around it is still
     * whole and lit all through (D4); a lone portal block (a {@code /setblock}) stays until such a change.
     */
    @Override
    protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
            BlockPos neighbourPos, BlockState neighbourState, RandomSource random) {
        Direction.Axis axis = state.getValue(AXIS);
        if ((direction.getAxis() == Direction.Axis.Y || direction.getAxis() == axis) && level instanceof LevelAccessor accessor) {
            Optional<PortalFrame.Rectangle> frame = PortalFrame.find(accessor, pos, axis, this::isFrame, this);
            if (frame.isEmpty() || !PortalFrame.isComplete(accessor, frame.get(), this)) {
                return Blocks.AIR.defaultBlockState();
            }
        }
        return super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbourState, random);
    }

    @Override
    protected BlockState rotate(BlockState state, Rotation rotation) {
        return switch (rotation) {
            case CLOCKWISE_90, COUNTERCLOCKWISE_90 ->
                    state.setValue(AXIS, state.getValue(AXIS) == Direction.Axis.X ? Direction.Axis.Z : Direction.Axis.X);
            default -> state;
        };
    }

    /**
     * On both sides, as vanilla's portal (the client's own player also keeps a portal process for its overlay): an entity
     * that may use a portal is marked inside this one, unless {@code players_only} keeps a non-player out; then
     * {@code msm:on_entity_inside}.
     */
    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        if (entity.canUsePortal(false) && (!portal.travel().playersOnly() || entity instanceof Player)) {
            entity.setAsInsidePortal(this, pos);
        }
        driver.entityInside(level, pos, entity);
    }

    /**
     * Players: an invulnerable (creative) player waits the gamerule {@code players_nether_portal_creative_delay}, any other
     * {@code delay_ticks} or the gamerule {@code players_nether_portal_default_delay}; everyone else goes at once.
     */
    @Override
    public int getPortalTransitionTime(ServerLevel level, Entity entity) {
        if (entity instanceof Player player) {
            GameRules rules = level.getGameRules();
            if (player.getAbilities().invulnerable) {
                return rules.get(GameRules.PLAYERS_NETHER_PORTAL_CREATIVE_DELAY);
            }
            return portal.travel().delayTicks().orElseGet(() -> rules.get(GameRules.PLAYERS_NETHER_PORTAL_DEFAULT_DELAY));
        }
        return 0;
    }

    @Override
    public TeleportTransition getPortalDestination(ServerLevel level, Entity entity, BlockPos pos) {
        // TODO(B336): travel and linking (ADR 0077 D6). Null: vanilla sets the portal cooldown and moves nobody.
        return null;
    }

    /** {@code overlay} (default true): vanilla's wobble, overlay and entry sound on the client; else none (limit P2). */
    @Override
    public Portal.Transition getLocalTransition() {
        return portal.travel().overlay() ? Portal.Transition.CONFUSION : Portal.Transition.NONE;
    }

    /** Client: {@code count} particles in the block and, about once in {@value #AMBIENT_ONE_IN} ticks, the ambient sound. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (ambient != null && random.nextInt(AMBIENT_ONE_IN) == 0) {
            level.playLocalSound(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, ambient, SoundSource.BLOCKS, 0.5f,
                    0.8f + random.nextFloat() * 0.4f, false);
        }
        boolean dust = particle instanceof DustParticleOptions;
        for (int i = 0; i < portal.particles().count(); i++) {
            double x = pos.getX() + random.nextDouble();
            double y = pos.getY() + random.nextDouble();
            double z = pos.getZ() + random.nextDouble();
            double speed = dust ? 0 : 0.5;
            level.addParticle(particle, x, y, z, (random.nextDouble() - 0.5) * speed, (random.nextDouble() - 0.5) * speed,
                    (random.nextDouble() - 0.5) * speed);
        }
    }

    /** Nothing to pick unless the definition gives the portal an {@code item}. */
    @Override
    protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
        return asItem() == Items.AIR ? ItemStack.EMPTY : super.getCloneItemStack(level, pos, state, includeData);
    }

    // Triggers allowed on a portal (ADR 0077 D1): delegated to the driver after vanilla's own behaviour.

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
        driver.randomTick(level, pos, random);
    }
}
