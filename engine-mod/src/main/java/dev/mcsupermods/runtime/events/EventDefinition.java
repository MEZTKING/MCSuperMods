package dev.mcsupermods.runtime.events;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.List;

/** A named list of actions, run in order on the logical server ({@code ::msm::action::Event}). */
public record EventDefinition(List<Action> actions) {
    public static final Codec<EventDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
            MsmCodecs.required("actions", Action.CODEC.listOf()).forGetter(EventDefinition::actions))
            .apply(i, EventDefinition::new));
}
