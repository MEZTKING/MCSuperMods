package dev.mcsupermods.runtime.registry.portal;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.types.MsmPortalBlock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.dimension.DimensionType;
import net.minecraft.world.level.portal.PortalShape;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Travel through a portal block (ADR 0077 D6), written from the ADR's rules: the target level, the coordinate factor, the
 * world border clamp, the linked exit (find or build through {@link ExitPortals}) or the surface, the traveller's place in
 * the exit, the travel sound, the cooldown on arrival and the {@code on_travel} event. Called from
 * {@link MsmPortalBlock#getPortalDestination} on the server; vanilla's portal processing does the rest (delay, passengers,
 * the {@code allow_entering_nether_using_portals} gamerule, the dimension change).
 */
public final class PortalTravel {
    /** The linking search radius never goes under this (the Nether's 16). */
    public static final int MIN_RADIUS = 16;
    /** The linking search radius at a factor of 1 or more (the overworld's 128). */
    public static final int MAX_RADIUS = 128;
    /** The travel sound of a project or other sound event, played to a travelling player at arrival (as vanilla's). */
    public static final float TRAVEL_VOLUME = 0.25f;

    /** "portal id > level id" pairs already warned about at use (one warning each per server). */
    private static final Set<String> WARNED = Collections.synchronizedSet(new LinkedHashSet<>());

    private PortalTravel() {}

    /** How a traveller arrives, as decided before any block is built (for tests and logs). */
    public enum Arrival {
        /** In a linked exit portal. */
        PORTAL,
        /** On the first standing spot of the target column. */
        SURFACE,
        /** At the clamped target itself: no standing spot and no exit could be built (a tag frame without frame_block over a void). */
        TARGET
    }

    /** What travels with the transition: the sound played by vanilla, a sound of our own, or none. */
    public sealed interface TravelSound {
        /** Vanilla's {@code PLAY_PORTAL_SOUND} (the target's portal travel sound). */
        record Vanilla() implements TravelSound {}

        /** A project or other registered sound event, sent to a travelling player at arrival. */
        record Own(SoundEvent sound) implements TravelSound {}

        /** No sound ({@code sounds.travel: false}, or an unknown sound id, which warned at load). */
        record None() implements TravelSound {}
    }

    /** The travel sound of a portal's {@code sounds.travel}. */
    public static TravelSound travelSound(BlockType.Portal portal) {
        BlockType.PortalSound sound = portal.sounds().travel();
        if (sound.off()) {
            return new TravelSound.None();
        }
        if (sound.sound().isEmpty()) {
            return new TravelSound.Vanilla();
        }
        Optional<SoundEvent> event = BuiltInRegistries.SOUND_EVENT.getOptional(sound.sound().get());
        return event.<TravelSound>map(TravelSound.Own::new).orElseGet(TravelSound.None::new);
    }

    /**
     * The level a portal of {@code portal} standing in {@code from} leads to: {@code return_to} from {@code destination},
     * else {@code destination} (also from a third dimension).
     */
    public static Identifier targetDimension(BlockType.Portal portal, Identifier from) {
        return from.equals(portal.destination()) ? portal.returnTo() : portal.destination();
    }

    /**
     * The factor that coordinates are multiplied by: with {@code travel.scale}, {@code 1 / scale} from {@code return_to} to
     * {@code destination} and {@code scale} back; otherwise (and from a third dimension) the dimension types' factor.
     */
    public static double factor(BlockType.Portal portal, Identifier from, Identifier to, DimensionType fromType, DimensionType toType) {
        Optional<Double> scale = portal.travel().scale();
        if (scale.isPresent()) {
            if (from.equals(portal.returnTo()) && to.equals(portal.destination())) {
                return 1.0 / scale.get();
            }
            if (from.equals(portal.destination()) && to.equals(portal.returnTo())) {
                return scale.get();
            }
        }
        return DimensionType.getTeleportationScale(fromType, toType);
    }

    /** The linking search radius for a factor: {@code clamp(round(128 * min(1, factor)), 16, 128)}. */
    public static int searchRadius(double factor) {
        return Math.clamp(Math.round(MAX_RADIUS * Math.min(1.0, factor)), MIN_RADIUS, MAX_RADIUS);
    }

    /** The target block: {@code position}'s x and z times {@code factor} (y kept), clamped to {@code target}'s world border. */
    public static BlockPos targetPosition(ServerLevel target, Vec3 position, double factor) {
        return target.getWorldBorder().clampToBounds(position.x * factor, position.y, position.z * factor);
    }

    /** The level for {@code dimension}, or null when it is not loaded in this world. */
    public static ServerLevel level(MinecraftServer server, Identifier dimension) {
        return server.getLevel(ResourceKey.create(Registries.DIMENSION, dimension));
    }

    /**
     * The start-up check (ADR 0077 D6): one warning per portal block and missing level (its {@code destination} or
     * {@code return_to} is not a level of this world). Also forgets the warnings given at use, so a new server warns again.
     * Returns the warnings without the mod-id prefix; {@code MsmRegistrar.checkAfterStart} logs them.
     */
    public static List<String> checkLevels(MinecraftServer server) {
        WARNED.clear();
        List<String> warnings = new ArrayList<>();
        for (MsmPortalBlock block : PortalLighting.portals()) {
            Set<Identifier> dimensions = new LinkedHashSet<>(List.of(block.portal().destination(), block.portal().returnTo()));
            for (Identifier dimension : dimensions) {
                if (level(server, dimension) == null) {
                    warnings.add(missingLevel(block.driver().id(), dimension));
                }
            }
        }
        return warnings;
    }

    private static String missingLevel(Identifier portal, Identifier dimension) {
        return "portal " + portal + ": dimension " + dimension + " is not a level of this world; nobody travels there";
    }

    /** The "portal > level" pairs warned about at use since the server started. */
    public static Set<String> warnedAtUse() {
        synchronized (WARNED) {
            return Set.copyOf(WARNED);
        }
    }

    /**
     * {@code getPortalDestination} of a portal block: where {@code entity}, inside {@code block} at {@code pos} in
     * {@code level}, goes; null (no teleport) for a missing level (one warning per portal and level) or a non-player at a
     * {@code players_only} portal.
     */
    public static TeleportTransition destination(MsmPortalBlock block, ServerLevel level, Entity entity, BlockPos pos) {
        BlockType.Portal portal = block.portal();
        if (portal.travel().playersOnly() && !(entity instanceof Player)) {
            return null;
        }
        Identifier from = level.dimension().identifier();
        Identifier to = targetDimension(portal, from);
        ServerLevel target = level(level.getServer(), to);
        if (target == null) {
            if (WARNED.add(block.driver().id() + ">" + to)) {
                MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, missingLevel(block.driver().id(), to));
            }
            return null;
        }
        double factor = factor(portal, from, to, level.dimensionType(), target.dimensionType());
        BlockPos targetPos = targetPosition(target, entity.position(), factor);
        PortalFrame.Rectangle entry = entryRectangle(level, block, pos);
        Optional<BlockState> frame = frameState(portal);

        Vec3 arrival;
        float yRot = entity.getYRot();
        Vec3 motion = entity.getDeltaMovement();
        Optional<Vec3> surface = portal.travel().arrival() == BlockType.PortalArrival.SURFACE || frame.isEmpty()
                ? surface(target, targetPos, entity)
                : Optional.empty();
        if (surface.isPresent()) {
            arrival = surface.get();
        } else if (frame.isPresent()) {
            PortalFrame.Rectangle exit = ExitPortals.findOrBuild(target, targetPos, entry.axis(), block, frame.get(), searchRadius(factor));
            arrival = placeInExit(target, entity, entry, exit);
            if (exit.axis() != entry.axis()) {
                // A quarter turn: the traveller keeps facing the same way relative to the portal.
                yRot += 90.0f;
                motion = new Vec3(-motion.z, motion.y, motion.x);
            }
        } else {
            arrival = Vec3.atBottomCenterOf(targetPos);
        }
        return new TeleportTransition(target, arrival, motion, yRot, entity.getXRot(), afterArrival(block, portal));
    }

    /** How {@code block} would take a traveller to {@code target} at {@code targetPos} (no blocks are built). */
    public static Arrival arrival(MsmPortalBlock block, ServerLevel target, BlockPos targetPos, Entity entity) {
        BlockType.Portal portal = block.portal();
        Optional<BlockState> frame = frameState(portal);
        if (portal.travel().arrival() == BlockType.PortalArrival.SURFACE || frame.isEmpty()) {
            if (surface(target, targetPos, entity).isPresent()) {
                return Arrival.SURFACE;
            }
        }
        return frame.isPresent() ? Arrival.PORTAL : Arrival.TARGET;
    }

    /**
     * The inside of the portal at {@code pos}: its index entry; else, when it stands in a whole lit frame, that frame,
     * which then joins the index (a portal placed by {@code /fill}, a structure or another mod, D5); else the single block
     * (a lone portal block: not indexed).
     */
    public static PortalFrame.Rectangle entryRectangle(ServerLevel level, MsmPortalBlock block, BlockPos pos) {
        Optional<PortalIndex.Entry> indexed = PortalIndexAttachment.at(level, block, pos);
        if (indexed.isPresent()) {
            return indexed.get().rectangle();
        }
        BlockState state = level.getBlockState(pos);
        Direction.Axis axis = state.is(block) ? state.getValue(MsmPortalBlock.AXIS) : Direction.Axis.X;
        Optional<PortalFrame.Rectangle> frame = PortalFrame.find(level, pos, axis, block::isFrame, block)
                .filter(r -> PortalFrame.isComplete(level, r, block));
        if (frame.isPresent()) {
            PortalIndexAttachment.add(level, block, frame.get());
            return frame.get();
        }
        return new PortalFrame.Rectangle(pos, axis, 1, 1);
    }

    /** The block exits are built of: {@code frame_block} (or the {@code frame} block); empty for a tag frame without it. */
    public static Optional<BlockState> frameState(BlockType.Portal portal) {
        return portal.frameBlock().flatMap(BuiltInRegistries.BLOCK::getOptional).filter(b -> b != Blocks.AIR).map(Block::defaultBlockState);
    }

    /**
     * The first standing spot in the column of {@code at}, from the top of the level's logical height down: a block with a
     * collision shape or a non-lava fluid (water counts: the traveller stands on its surface, as vanilla's surface spawn
     * tolerates), with room for {@code entity} above it (no collision, no lava) and below the top. Lava is never ground: a
     * column whose first spot with room is lava (a lava lake or sea) is skipped, so the result is empty and the caller falls
     * back to an exit or the target (B336b). Empty in a void.
     */
    public static Optional<Vec3> surface(ServerLevel level, BlockPos at, Entity entity) {
        int top = ExitPortals.topY(level);
        int room = Math.max(1, (int) Math.ceil(entity.getBbHeight()));
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos(at.getX(), top, at.getZ());
        for (int y = top - room; y >= level.getMinY(); y--) {
            p.setY(y);
            BlockState ground = level.getBlockState(p);
            if (ground.getCollisionShape(level, p).isEmpty() && ground.getFluidState().isEmpty()) {
                continue;
            }
            if (hasRoom(level, p.above(), room)) {
                if (ground.getFluidState().is(FluidTags.LAVA)) {
                    return Optional.empty();
                }
                VoxelShape shape = ground.getCollisionShape(level, p);
                double floor = shape.isEmpty() ? y + 1 : y + shape.max(Direction.Axis.Y);
                return Optional.of(new Vec3(at.getX() + 0.5, floor, at.getZ() + 0.5));
            }
        }
        return Optional.empty();
    }

    private static boolean hasRoom(ServerLevel level, BlockPos feet, int room) {
        for (int i = 0; i < room; i++) {
            BlockPos pos = feet.above(i);
            BlockState state = level.getBlockState(pos);
            if (!state.getCollisionShape(level, pos).isEmpty() || state.getFluidState().is(FluidTags.LAVA)) {
                return false;
            }
        }
        return true;
    }

    /**
     * The traveller's place in {@code exit}: the same share of the usable width and height as in {@code entry} (from
     * vanilla's generic {@link PortalShape#getRelativePosition}), the same distance from the portal's middle plane, then
     * moved to the nearest place without collisions ({@link PortalShape#findCollisionFreePosition}).
     */
    public static Vec3 placeInExit(ServerLevel target, Entity entity, PortalFrame.Rectangle entry, PortalFrame.Rectangle exit) {
        EntityDimensions dimensions = entity.getDimensions(entity.getPose());
        Vec3 relative = PortalShape.getRelativePosition(entry.foundRectangle(), entry.axis(), entity.position(), dimensions);
        double width = dimensions.width();
        double height = dimensions.height();
        double spareWidth = exit.width() - width;
        double spareHeight = exit.height() - height;
        Direction.Axis along = exit.axis();
        Direction.Axis across = along == Direction.Axis.X ? Direction.Axis.Z : Direction.Axis.X;
        double a = spareWidth > 0 ? exit.min().get(along) + width / 2 + relative.x * spareWidth : exit.min().get(along) + exit.width() / 2.0;
        double y = exit.min().getY() + (spareHeight > 0 ? relative.y * spareHeight : 0);
        double c = exit.min().get(across) + 0.5 + relative.z;
        Vec3 place = along == Direction.Axis.X ? new Vec3(a, y, c) : new Vec3(c, y, a);
        return PortalShape.findCollisionFreePosition(place, target, entity, dimensions);
    }

    /**
     * After arrival: a portal ticket at the arrival (as vanilla), the travel sound, the cooldown and the {@code on_travel}
     * event with the arrived entity (a re-created one for non-players) as self and other.
     */
    private static TeleportTransition.PostTeleportTransition afterArrival(MsmPortalBlock block, BlockType.Portal portal) {
        TravelSound sound = travelSound(portal);
        TeleportTransition.PostTeleportTransition post = sound instanceof TravelSound.Vanilla
                ? TeleportTransition.PLAY_PORTAL_SOUND.then(TeleportTransition.PLACE_PORTAL_TICKET)
                : TeleportTransition.PLACE_PORTAL_TICKET;
        return post.then(arrived -> {
            if (sound instanceof TravelSound.Own own && arrived instanceof ServerPlayer player) {
                player.connection.send(new ClientboundSoundPacket(BuiltInRegistries.SOUND_EVENT.wrapAsHolder(own.sound()), SoundSource.AMBIENT,
                        player.getX(), player.getY(), player.getZ(), TRAVEL_VOLUME, 0.8f + player.getRandom().nextFloat() * 0.4f,
                        player.getRandom().nextLong()));
            }
            portal.travel().cooldownTicks().ifPresent(arrived::setPortalCooldown);
            if (portal.onTravel().isPresent() && arrived.level() instanceof ServerLevel arrivedLevel) {
                EventRunner.fire(block.driver().id(), block.driver().definition().events(), portal.onTravel().get(),
                        EventContext.forBlockActor(arrivedLevel, arrived.blockPosition(), arrived));
            }
        });
    }
}
