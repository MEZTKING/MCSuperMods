package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.client.particle.ParticleLook;
import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.ParticleDefinition;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;

/**
 * Project particle types (ADR 0080 D1, D3): every {@code msm/<ns>/particle/*.json} becomes an option-less
 * {@link SimpleParticleType} made by {@code FabricParticleTypes.simple(always_show)} under the definition id. Registered
 * right after sound events and before effects, potions, blocks and items ({@link MsmRegistrar#registerAll}), so every
 * later definition can name them. Fabric marks the particle type registry as synced (fact F18), so a client without the
 * same types is refused at join.
 *
 * <p>Server and client both register the types; only the client entrypoint ({@code MsmRuntimeClient}) reads
 * {@link #spec} and registers a provider for each type. Nothing here loads a client class on a dedicated server:
 * {@link #spec} is the only member that names {@code ParticleLook} (a pure class without Minecraft client types), and
 * only the client calls it.
 */
public final class MsmParticles {
    private static final Map<Identifier, SimpleParticleType> TYPES = new LinkedHashMap<>();
    private static final Map<Identifier, ParticleDefinition> DEFINITIONS = new LinkedHashMap<>();

    private MsmParticles() {}

    /**
     * Parses and registers every particle definition, in the scanner's sorted order; returns the ids registered. A file
     * that does not decode registers nothing (its errors are reported); an id already in the registry (vanilla's or
     * another mod's) is an error.
     */
    static List<Identifier> registerAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        List<Identifier> registered = new ArrayList<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals("particle")) {
                continue;
            }
            ParseResult<ParticleDefinition> parsed = DefinitionParser.parseParticle(raw.json());
            MsmRegistrar.report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            try {
                if (BuiltInRegistries.PARTICLE_TYPE.containsKey(raw.id())) {
                    throw new DefinitionException("particle type id " + raw.id() + " is already registered");
                }
                ParticleDefinition def = parsed.definition().get();
                SimpleParticleType type = Registry.register(BuiltInRegistries.PARTICLE_TYPE, raw.id(),
                        FabricParticleTypes.simple(def.alwaysShow()));
                TYPES.put(raw.id(), type);
                DEFINITIONS.put(raw.id(), def);
                registered.add(raw.id());
            } catch (DefinitionException | RuntimeException e) {
                MsmRegistrar.fail(errors, raw, e);
            }
        }
        return List.copyOf(registered);
    }

    /** Every project particle type registered by this runtime, by id, in registration order. */
    public static Map<Identifier, SimpleParticleType> types() {
        return Collections.unmodifiableMap(TYPES);
    }

    /** The definition of project particle type {@code id}. */
    public static Optional<ParticleDefinition> definition(Identifier id) {
        return Optional.ofNullable(DEFINITIONS.get(id));
    }

    /**
     * How project particle type {@code id} looks and moves (client only: the client entrypoint builds the provider from
     * it). Throws for an id this runtime did not register.
     */
    public static ParticleLook.Spec spec(Identifier id) {
        ParticleDefinition def = DEFINITIONS.get(id);
        if (def == null) {
            throw new IllegalArgumentException("not a project particle type: " + id);
        }
        return spec(def);
    }

    /** {@code def} with its absent fields resolved by {@code ParticleLook.Spec.resolve} (ADR 0080 D1's defaults). */
    public static ParticleLook.Spec spec(ParticleDefinition def) {
        ParticleDefinition.Life life = def.life();
        ParticleDefinition.Looks looks = def.looks();
        return ParticleLook.Spec.resolve(
                life.animation().map(ParticleLook.Animation::byName).orElse(null),
                life.frameTicks().orElse(null),
                life.lifetime().map(ParticleDefinition.Lifetime::min).orElse(null),
                life.lifetime().map(ParticleDefinition.Lifetime::max).orElse(null),
                life.size().orElse(null),
                life.sizeEnd().orElse(null),
                life.gravity().orElse(null),
                life.friction().orElse(null),
                life.collision().orElse(null),
                looks.color().orElse(null),
                looks.colorEnd().orElse(null),
                looks.alpha().orElse(null),
                looks.fade().map(ParticleLook.Fade::byName).orElse(null),
                looks.emissive().orElse(null),
                looks.translucent().orElse(null),
                looks.spin().orElse(null),
                looks.alwaysShow().orElse(null));
    }
}
