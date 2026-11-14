package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;

/**
 * {@code World.raycast} and {@code Entity.raycast} (ADR 0065 D6): the first block (outline shapes, as the player's
 * crosshair; fluid surfaces only with {@code fluids}) or living entity (alive, not a spectator, not ignored) along a
 * ray of at most {@value #MAX_DISTANCE} blocks; a longer or negative distance is a {@code RangeError}.
 */
final class ScriptRaycast {
    private ScriptRaycast() {}

    /** The longest ray (ADR 0065 D6 default). */
    static final double MAX_DISTANCE = 128;

    /** A hit: a block with its face, or an entity. */
    record Hit(String kind, Vec3 pos, double distance, BlockRef block, Direction face, Entity entity) {}

    static final ScriptType TYPE = ScriptType.of("RayHit")
            .constant("kind", Hit.class, (api, h) -> h.kind())
            .constant("pos", Hit.class, (api, h) -> api.pos(ScriptPos.of(h.pos())))
            .constant("distance", Hit.class, (api, h) -> h.distance())
            .constant("block", Hit.class, (api, h) -> h.block() == null ? null : api.block(h.block()))
            .constant("face", Hit.class, (api, h) -> h.face() == null ? null : h.face().getSerializedName())
            .constant("entity", Hit.class, (api, h) -> h.entity() == null ? null : api.entity(h.entity()));

    /**
     * Casts a ray; {@code self} (or null) is always passed through. Returns the script {@code RayHit} or null for
     * {@code undefined}.
     */
    static Object cast(ScriptApi api, ServerLevel level, Vec3 from, Vec3 direction, Object[] args, int distanceArg, Entity self) {
        double max = ScriptValues.number(args, distanceArg, "maxDistance");
        if (max < 0 || max > MAX_DISTANCE) {
            throw ScriptValues.rangeError("maxDistance " + ScriptRuntime.numberToString(max, 10) + " is not 0 to "
                    + (int) MAX_DISTANCE);
        }
        Scriptable options = ScriptValues.options(args, distanceArg + 1, "options");
        boolean fluids = ScriptValues.booleanMember(options, "fluids", false);
        boolean entities = ScriptValues.booleanMember(options, "entities", true);
        Object ignoreValue = ScriptValues.member(options, "ignore");
        Entity ignore = ignoreValue == null ? null : ScriptValues.entity(ignoreValue, "options.ignore");
        if (direction.lengthSqr() < 1.0E-12) {
            throw ScriptRuntime.typeError("direction is a zero vector");
        }
        Vec3 to = from.add(direction.normalize().scale(max));
        BlockHitResult blockHit = level.clip(new ClipContext(from, to, ClipContext.Block.OUTLINE,
                fluids ? ClipContext.Fluid.ANY : ClipContext.Fluid.NONE, CollisionContext.empty()));
        Vec3 end = blockHit.getType() == HitResult.Type.MISS ? to : blockHit.getLocation();
        if (entities) {
            EntityHitResult entityHit = ProjectileUtil.getEntityHitResult(level, self, from, end,
                    new AABB(from, end).inflate(1.0),
                    e -> e instanceof LivingEntity && e.isAlive() && !e.isSpectator() && e != self && e != ignore, 0f);
            if (entityHit != null) {
                Vec3 at = entityHit.getLocation();
                return api.rayHit(new Hit("entity", at, from.distanceTo(at), null, null, entityHit.getEntity()));
            }
        }
        if (blockHit.getType() == HitResult.Type.MISS) {
            return null;
        }
        BlockPos pos = blockHit.getBlockPos();
        Vec3 at = blockHit.getLocation();
        return api.rayHit(new Hit("block", at, from.distanceTo(at), new BlockRef(level.getBlockState(pos), pos),
                blockHit.getDirection(), null));
    }
}
