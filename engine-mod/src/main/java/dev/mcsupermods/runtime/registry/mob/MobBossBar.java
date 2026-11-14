package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.ArrayList;
import java.util.Optional;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Boss bars, ADR 0071 D5 ({@code msm:boss_bar}), the wither's rule: one {@link ServerBossEvent} per mob, built on the
 * logical server on first use, named by the mob's display name (its custom name when it has one), progress health /
 * max health. Without {@code range} the players are those tracking the mob ({@code startSeenByPlayer} and
 * {@code stopSeenByPlayer}; the registrar raises the type's client tracking range to 10 chunks); with {@code range}
 * they are the players of the mob's level within that many blocks, checked every {@link #RANGE_INTERVAL} ticks. Name,
 * progress and the range check run in the AI step (as the wither's), so a {@code NoAI} boss keeps the name and progress
 * it had when it stopped thinking. Death, removal and a dimension change (the old entity is removed) take every player
 * off the bar; a dying mob adds nobody. A boss never despawns. Nothing is saved: the bar is rebuilt from the
 * definition and the custom name. Music: vanilla plays its boss track ({@code Musics.END_BOSS}) only in the End, so
 * {@code music} changes nothing elsewhere (javap, 26.3 and 26.4-snapshot-7 {@code Minecraft.getSituationalMusic}).
 */
public final class MobBossBar {
    /** Ticks between two range checks (ADR 0071 D5). */
    public static final int RANGE_INTERVAL = 10;

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** Null until first needed on the server; never built on the client. */
    private ServerBossEvent event;

    MobBossBar(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    private Optional<EntityComponents.BossBar> component() {
        return definition == null ? Optional.empty() : definition.components().bossBar();
    }

    /** The mob's boss event; empty without {@code msm:boss_bar} or on the client. */
    public Optional<ServerBossEvent> event() {
        if (event == null && component().isPresent() && mob.asMob().level() instanceof ServerLevel) {
            EntityComponents.BossBar bar = component().get();
            PathfinderMob body = mob.asMob();
            event = new ServerBossEvent(Mth.createInsecureUUID(body.getRandom()), body.getDisplayName(),
                    BossEvent.BossBarColor.valueOf(bar.colour().name()), BossEvent.BossBarOverlay.valueOf(bar.overlay().name()));
            event.setDarkenScreen(bar.darkenSky());
            event.setPlayBossMusic(bar.music());
            event.setCreateWorldFog(bar.fog());
            event.setProgress(progress());
        }
        return Optional.ofNullable(event);
    }

    private float progress() {
        PathfinderMob body = mob.asMob();
        return Math.clamp(body.getHealth() / body.getMaxHealth(), 0.0f, 1.0f); // Mth.clamp(float...) is gone in 26.4
    }

    /** Whether the mob may show its bar to anyone: alive, not dying and not removed. */
    private boolean showing() {
        PathfinderMob body = mob.asMob();
        return body.isAlive() && !body.isDeadOrDying() && !body.isRemoved();
    }

    /** After {@code msm:on_tick}, every AI step: name, progress and, with {@code range}, the players by distance. */
    public void customServerAiStep(ServerLevel level) {
        Optional<ServerBossEvent> found = event();
        if (found.isEmpty()) {
            return;
        }
        ServerBossEvent bar = found.get();
        PathfinderMob body = mob.asMob();
        Component name = body.getDisplayName();
        if (!name.equals(bar.getName())) {
            bar.setName(name);
        }
        bar.setProgress(progress());
        Optional<Float> range = component().flatMap(EntityComponents.BossBar::range);
        if (range.isPresent() && (level.getGameTime() + body.getId()) % RANGE_INTERVAL == 0) {
            updateRange(level, bar, range.get());
        }
    }

    private void updateRange(ServerLevel level, ServerBossEvent bar, float range) {
        double max = (double) range * range;
        PathfinderMob body = mob.asMob();
        for (ServerPlayer player : new ArrayList<>(bar.getPlayers())) {
            if (player.isRemoved() || player.level() != level || player.distanceToSqr(body) > max) {
                bar.removePlayer(player);
            }
        }
        if (!showing()) {
            return;
        }
        for (ServerPlayer player : level.players()) {
            if (!player.isRemoved() && player.distanceToSqr(body) <= max) {
                bar.addPlayer(player);
            }
        }
    }

    public void startSeenByPlayer(ServerPlayer player) {
        if (component().flatMap(EntityComponents.BossBar::range).isPresent() || !showing()) {
            return;
        }
        event().ifPresent(bar -> {
            bar.setProgress(progress());
            bar.addPlayer(player);
        });
    }

    public void stopSeenByPlayer(ServerPlayer player) {
        if (event != null && component().flatMap(EntityComponents.BossBar::range).isEmpty()) {
            event.removePlayer(player);
        }
    }

    /** After vanilla's {@code die} and {@code msm:on_death}: the bar empties and goes. */
    public void die(DamageSource source) {
        if (event != null) {
            event.setProgress(0.0f);
            event.removeAllPlayers();
        }
    }

    /** After vanilla's {@code remove} (killed, discarded, unloaded, changed dimension). */
    public void remove(Entity.RemovalReason reason) {
        if (event != null) {
            event.removeAllPlayers();
        }
    }

    /** A boss never despawns (ADR 0071 D5). */
    public boolean requiresCustomPersistence(boolean vanilla) {
        return vanilla || component().isPresent();
    }

    public void addAdditionalSaveData(ValueOutput output) {}

    public void readAdditionalSaveData(ValueInput input) {}
}
