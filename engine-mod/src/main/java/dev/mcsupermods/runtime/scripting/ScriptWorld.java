package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.events.EventRunner;
import java.util.List;
import java.util.Optional;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.commands.functions.CommandFunction;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.mozilla.javascript.ScriptRuntime;

/**
 * {@code World} (ADR 0032 D2) over a {@link ServerLevel}. Commands and functions run as the server with permission
 * level 2 (as {@code run_function} actions do) and suppressed output.
 */
final class ScriptWorld {
    private ScriptWorld() {}

    static final ScriptType TYPE = ScriptType.of("World")
            .constant("dimension", ServerLevel.class, (api, l) -> l.dimension().identifier().toString())
            .live("time", ServerLevel.class, (api, l) -> (double) l.getGameTime())
            .method("getBlock", 1, 1, ServerLevel.class, (api, l, args) ->
                    BlockStateParser.serialize(l.getBlockState(ScriptPos.arg(args, 0, "pos").block())))
            .method("setBlock", 2, 2, ServerLevel.class, (api, l, args) -> {
                ScriptPos pos = ScriptPos.arg(args, 0, "pos");
                Optional<BlockState> state = EventRunner.parseState(ScriptValues.string(args, 1, "state"));
                return state.isPresent() && l.setBlockAndUpdate(pos.block(), state.get());
            })
            .method("spawnParticle", 2, 3, ServerLevel.class, (api, l, args) -> {
                String id = ScriptValues.string(args, 0, "id");
                ParticleType<?> type = ScriptValues.entry(BuiltInRegistries.PARTICLE_TYPE, id, "particle type");
                if (!(type instanceof SimpleParticleType simple)) {
                    throw ScriptRuntime.typeError(id + " is not a particle type without options");
                }
                Vec3 at = ScriptPos.arg(args, 1, "pos").vec();
                int count = (int) Math.max(1, ScriptValues.option(args, 2, "count", 1));
                double spread = Math.max(0, ScriptValues.option(args, 2, "spread", 0));
                double speed = Math.max(0, ScriptValues.option(args, 2, "speed", 0));
                l.sendParticles(simple, at.x, at.y, at.z, count, spread, spread, spread, speed);
                return null;
            })
            .method("playSound", 2, 3, ServerLevel.class, (api, l, args) -> {
                SoundEvent sound = ScriptValues.entry(BuiltInRegistries.SOUND_EVENT, ScriptValues.string(args, 0, "id"), "sound");
                Vec3 at = ScriptPos.arg(args, 1, "pos").vec();
                float volume = (float) Math.max(0, ScriptValues.option(args, 2, "volume", 1));
                float pitch = (float) Math.max(0, ScriptValues.option(args, 2, "pitch", 1));
                l.playSound(null, at.x, at.y, at.z, sound, SoundSource.BLOCKS, volume, pitch);
                return null;
            })
            .method("runCommand", 1, 1, ServerLevel.class, (api, l, args) -> {
                String command = ScriptValues.string(args, 0, "command");
                int[] result = {0};
                CommandSourceStack source = source(l).withCallback((success, value) -> {
                    if (success) {
                        result[0] += value;
                    }
                });
                l.getServer().getCommands().performPrefixedCommand(source, command);
                return result[0];
            })
            .method("runFunction", 1, 1, ServerLevel.class, (api, l, args) -> {
                MinecraftServer server = l.getServer();
                Optional<CommandFunction<CommandSourceStack>> function = server.getFunctions()
                        .get(ScriptValues.id(ScriptValues.string(args, 0, "id"), "function id"));
                if (function.isEmpty()) {
                    return false;
                }
                server.getFunctions().execute(function.get(), source(l));
                return true;
            })
            .method("spawnEntity", 2, 2, ServerLevel.class, (api, l, args) -> {
                String id = ScriptValues.string(args, 0, "id");
                ScriptPos pos = ScriptPos.arg(args, 1, "pos");
                Optional<EntityType<?>> type = BuiltInRegistries.ENTITY_TYPE.getOptional(ScriptValues.id(id, "entity type"));
                if (type.isEmpty()) {
                    return null;
                }
                // Spawned at the bottom centre of the block that contains the position, as /summon on block coordinates.
                Entity entity = type.get().spawn(l, pos.block(), EntitySpawnReason.COMMAND);
                return entity == null ? null : api.entity(entity);
            })
            .method("entitiesNear", 2, 2, ServerLevel.class, (api, l, args) -> {
                Vec3 at = ScriptPos.arg(args, 0, "pos").vec();
                double radius = Math.max(0, ScriptValues.number(args, 1, "radius"));
                List<LivingEntity> found = l.getEntitiesOfClass(LivingEntity.class, AABB.ofSize(at, radius * 2, radius * 2, radius * 2),
                        e -> e.position().distanceToSqr(at) <= radius * radius);
                return api.array(found.stream().map(api::entity).toArray());
            });

    private static CommandSourceStack source(ServerLevel level) {
        return level.getServer().createCommandSourceStack()
                .withLevel(level)
                .withPermission(LevelBasedPermissionSet.GAMEMASTER) // permission level 2
                .withSuppressedOutput();
    }
}
