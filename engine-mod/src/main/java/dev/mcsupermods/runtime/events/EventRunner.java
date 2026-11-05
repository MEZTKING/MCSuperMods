package dev.mcsupermods.runtime.events;

import dev.mcsupermods.runtime.MsmRuntime;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;

/** Runs events on the logical server. */
public final class EventRunner {
    private EventRunner() {}

    public static void run(Identifier owner, Map<Identifier, EventDefinition> events, Identifier eventId, EventContext ctx) {
        EventDefinition event = events.get(eventId);
        if (event == null) {
            MsmRuntime.LOGGER.error("[{}] {}: unknown event {}", MsmRuntime.MOD_ID, owner, eventId);
            return;
        }
        for (Action action : event.actions()) {
            switch (action) {
                case Action.PlaySound s -> {
                    Optional<SoundEvent> sound = BuiltInRegistries.SOUND_EVENT.getOptional(s.sound());
                    if (sound.isEmpty()) {
                        MsmRuntime.LOGGER.error("[{}] {}: unknown sound {}", MsmRuntime.MOD_ID, owner, s.sound());
                        continue;
                    }
                    ctx.level().playSound(null, ctx.pos(), sound.get(), SoundSource.BLOCKS, s.volume(), s.pitch());
                }
                case Action.GiveItem g -> {
                    if (ctx.player() == null) {
                        continue;
                    }
                    Optional<Item> item = BuiltInRegistries.ITEM.getOptional(g.item());
                    if (item.isEmpty()) {
                        MsmRuntime.LOGGER.error("[{}] {}: unknown item {}", MsmRuntime.MOD_ID, owner, g.item());
                        continue;
                    }
                    ItemStack stack = new ItemStack(item.get(), g.count());
                    if (!ctx.player().addItem(stack) && !stack.isEmpty()) {
                        Block.popResource(ctx.level(), ctx.player().blockPosition(), stack);
                    }
                }
            }
        }
    }
}
