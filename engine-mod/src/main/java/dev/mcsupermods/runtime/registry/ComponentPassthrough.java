package dev.mcsupermods.runtime.registry;

import com.google.gson.JsonElement;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import net.minecraft.core.HolderGetter;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;

/**
 * {@code msm:components} (ADR 0044 D1): decodes each vanilla data component with its own Codec
 * ({@code DataComponentType.codecOrThrow()}) over {@link RegistryOps} on the built-in (static) registries and sets it on
 * the item's properties. Runs before MSM's own components, so those win on a clash.
 *
 * <p>A value that needs a data pack registry (an enchantment, a jukebox song, a trim material) cannot be decoded while
 * mods initialise. The components in {@link #DELAYED} are decoded later instead, through
 * {@code Item.Properties.delayedComponent}, against the registries the game passes once data packs are loaded; any other
 * such component is a load error and is not applied.
 */
public final class ComponentPassthrough {
    /** Components whose value is a holder in a data pack registry, decoded once data packs are loaded. */
    public static final Set<Identifier> DELAYED = Set.of(
            Identifier.withDefaultNamespace("jukebox_playable"),
            Identifier.withDefaultNamespace("provides_trim_material"),
            Identifier.withDefaultNamespace("trim"));

    private static RegistryAccess staticRegistries;

    private ComponentPassthrough() {}

    /** Applies every entry of {@code components}; problems are added to {@code errors} and the entry is skipped. */
    static Item.Properties apply(Item.Properties props, RawDefinition raw, Map<Identifier, JsonElement> components, List<String> errors) {
        for (Map.Entry<Identifier, JsonElement> e : components.entrySet()) {
            Identifier id = e.getKey();
            Optional<DataComponentType<?>> type = BuiltInRegistries.DATA_COMPONENT_TYPE.getOptional(id);
            String where = raw.describe() + ": msm:components: " + id + ": ";
            if (type.isEmpty()) {
                error(errors, where + "unknown data component");
                continue;
            }
            if (type.get().isTransient()) {
                error(errors, where + "not a persistent data component; not supported");
                continue;
            }
            props = applyOne(props, raw, id, type.get(), e.getValue(), where, errors);
        }
        return props;
    }

    private static <T> Item.Properties applyOne(Item.Properties props, RawDefinition raw, Identifier id, DataComponentType<T> type,
            JsonElement json, String where, List<String> errors) {
        Codec<T> codec = type.codecOrThrow();
        Set<Identifier> missing = new TreeSet<>();
        DataResult<T> result = codec.parse(staticOps(missing), json);
        if (result.result().isPresent()) {
            return props.component(type, result.result().get());
        }
        if (DELAYED.contains(id)) {
            return props.delayedComponent(type, provider -> decodeLate(raw, id, codec, json, provider));
        }
        String message = result.error().map(DataResult.Error::message).orElse("invalid value");
        if (!missing.isEmpty()) {
            error(errors, where + "needs a data pack registry (" + String.join(", ", missing.stream().map(Identifier::toString).toList())
                    + "); not supported (" + message + ")");
        } else {
            error(errors, where + message);
        }
        return props;
    }

    /** Decodes a {@link #DELAYED} component once data packs are loaded; on failure logs and leaves the component unset. */
    private static <T> T decodeLate(RawDefinition raw, Identifier id, Codec<T> codec, JsonElement json, HolderLookup.Provider provider) {
        DataResult<T> result = codec.parse(RegistryOps.create(JsonOps.INSTANCE, provider), json);
        if (result.error().isPresent()) {
            MsmRuntime.LOGGER.error("[{}] {}: msm:components: {}: {}; the component is not set", MsmRuntime.MOD_ID, raw.describe(), id,
                    result.error().get().message());
            return null;
        }
        return result.getOrThrow();
    }

    /** Registry ops over the built-in registries that record every registry asked for and not found. */
    private static RegistryOps<JsonElement> staticOps(Set<Identifier> missing) {
        if (staticRegistries == null) {
            staticRegistries = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        }
        RegistryAccess registries = staticRegistries;
        return RegistryOps.create(JsonOps.INSTANCE, new RegistryOps.RegistryInfoLookup() {
            @Override
            @SuppressWarnings("unchecked")
            public <E> Optional<HolderGetter<E>> lookup(ResourceKey<? extends Registry<? extends E>> key) {
                Optional<? extends HolderLookup.RegistryLookup<E>> found = registries.lookup(key);
                if (found.isEmpty()) {
                    missing.add(key.identifier());
                }
                return found.map(l -> (HolderGetter<E>) l);
            }
        });
    }

    private static void error(List<String> errors, String message) {
        errors.add(message);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
    }
}
