package dev.mcsupermods.runtime.hud;

import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;
import dev.mcsupermods.runtime.loader.HudDefinition;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.net.HudPayload;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.scripting.ScriptData;
import dev.mcsupermods.runtime.scripting.ScriptDataAttachment;
import java.util.List;
import java.util.Optional;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ReadOnlyScoreInfo;
import net.minecraft.world.scores.ScoreHolder;
import net.minecraft.world.scores.Scoreboard;

/**
 * The server's HUD values (ADR 0089 D2): what a {@code data}, {@code score} or {@code vehicle} value is for one player
 * now. A value is a {@link Double}, a {@link String} (at most {@link HudPayload#MAX_TEXT} characters) or null (nothing
 * to show). {@code player} values are read on the client and {@code set} values only come from actions, so both are null
 * here.
 *
 * <ul>
 *   <li>{@code data}: the saved script value (ADR 0062) of the player or of the world: a number as is, a string as text
 *       (cut to 256 characters), {@code true}/{@code false} as 1 and 0; anything else, or nothing, is null.</li>
 *   <li>{@code score}: the objective's score of the player ({@code @s}) or of the fixed holder; null without the
 *       objective or the score.</li>
 *   <li>{@code vehicle}: null unless the player rides a project vehicle. {@code fuel} in ticks; {@code health} is
 *       {@code health.max} less the damage taken (two decimals); {@code ammo} the rounds loaded and {@code reload} the
 *       ticks until the weapon may fire again ({@code readyAt - gameTime}, at least 0), both for {@code weapon} or the
 *       first weapon, null when the vehicle has no such weapon; {@code speed} in blocks a second (one decimal), from
 *       how far the vehicle moved since the last update ({@link HudSync} tracks it).</li>
 * </ul>
 */
public final class HudValues {
    private HudValues() {}

    /** The value of {@code value} for {@code player}; {@code speed} is the vehicle's speed in blocks a second, or NaN. */
    public static Object compute(HudDefinition.HudValue value, ServerPlayer player, double speed) {
        return switch (value) {
            case HudDefinition.Data d -> data(d, player);
            case HudDefinition.Score s -> score(s, player);
            case HudDefinition.Vehicle v -> vehicle(v, player, speed);
            case HudDefinition.Player p -> null;
            case HudDefinition.SetOnly s -> null;
        };
    }

    static Object data(HudDefinition.Data d, ServerPlayer player) {
        MinecraftServer server = player.level().getServer();
        ScriptData data = d.scope() == HudDefinition.DataScope.PLAYER
                ? ScriptDataAttachment.get(player)
                : server == null ? ScriptData.EMPTY : ScriptDataAttachment.get(ScriptDataAttachment.world(server));
        return of(data.get(d.namespace(), d.key()));
    }

    /** A saved script value as a HUD value. */
    static Object of(JsonElement json) {
        if (!(json instanceof JsonPrimitive p)) {
            return null;
        }
        if (p.isNumber()) {
            double n = p.getAsDouble();
            return Double.isFinite(n) ? n : null;
        }
        if (p.isBoolean()) {
            return p.getAsBoolean() ? 1.0 : 0.0;
        }
        return text(p.getAsString());
    }

    /** {@code text} cut to {@link HudPayload#MAX_TEXT} characters. */
    static String text(String text) {
        return text.length() <= HudPayload.MAX_TEXT ? text : text.substring(0, HudPayload.MAX_TEXT);
    }

    static Object score(HudDefinition.Score s, ServerPlayer player) {
        MinecraftServer server = player.level().getServer();
        if (server == null) {
            return null;
        }
        Scoreboard scoreboard = server.getScoreboard();
        Objective objective = scoreboard.getObjective(s.objective());
        if (objective == null) {
            return null;
        }
        String holder = s.holder().equals(HudDefinition.Score.SELF) ? player.getScoreboardName() : s.holder();
        ReadOnlyScoreInfo info = scoreboard.getPlayerScoreInfo(ScoreHolder.forNameOnly(holder), objective);
        return info == null ? null : (double) info.value();
    }

    static Object vehicle(HudDefinition.Vehicle v, ServerPlayer player, double speed) {
        if (!(player.getVehicle() instanceof MsmVehicle vehicle)) {
            return null;
        }
        return switch (v.stat()) {
            case FUEL -> (double) vehicle.fuel().fuel();
            case HEALTH -> round(Math.max(0, vehicle.health().max() - vehicle.getDamage()), 100);
            case SPEED -> Double.isNaN(speed) ? null : round(speed, 10);
            case AMMO -> weapon(vehicle, v.weapon()).map(i -> (Object) (double) vehicle.ammo(i)).orElse(null);
            case RELOAD -> weapon(vehicle, v.weapon())
                    .map(i -> (Object) (double) Math.max(0, vehicle.readyAt(i) - vehicle.level().getGameTime())).orElse(null);
        };
    }

    /** The index of {@code weapon} (or of the first weapon) in the vehicle's definition. */
    public static Optional<Integer> weapon(MsmVehicle vehicle, Optional<String> weapon) {
        List<VehicleDefinition.Weapon> weapons = vehicle.definition().weapons();
        if (weapon.isEmpty()) {
            return weapons.isEmpty() ? Optional.empty() : Optional.of(0);
        }
        for (int i = 0; i < weapons.size(); i++) {
            if (weapons.get(i).id().equals(weapon.get())) {
                return Optional.of(i);
            }
        }
        return Optional.empty();
    }

    private static double round(double value, double scale) {
        return Math.round(value * scale) / scale;
    }
}
