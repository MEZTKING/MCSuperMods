package dev.mcsupermods.runtime.client.vanilla;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.model.GeoAnimationClip;
import dev.mcsupermods.runtime.model.GeoAnimationReader;
import dev.mcsupermods.runtime.model.GeoMesh;
import dev.mcsupermods.runtime.model.GeoMeshReader;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobAnimations;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.TamableAnimal;

/**
 * The vanilla renderer of a runtime mob type without GeckoLib (ADR 0072 D1, D2): {@code renderer: vanilla}, or
 * {@code auto} when GeckoLib is not loaded. The provider reads the geo and animation files named by
 * {@code msm:animated_model} from GeckoLib's paths ({@code assets/<ns>/geckolib/models/<path>.geo.json},
 * {@code assets/<ns>/geckolib/animations/<path>.animation.json}) through {@code Context.getResourceManager()}, so a
 * resource reload rebuilds it. A missing or broken model draws nothing (shadow and name tag stay vanilla's) and each
 * problem is logged once per game; nothing here throws into the render loop.
 *
 * <p>Triggered animations follow {@code DATA_ANIM} ({@link MobAnimations}): when the synched value changes, the
 * animation at its index starts (others of the same controller stop, as GeckoLib's triggered controller plays one at a
 * time). The value seen when a mob first renders only records the counter, so an old animation does not replay when
 * a mob comes into view. One value per tick reaches the client (plan limit M3).
 */
public class MsmVanillaRenderer extends MobRenderer<Mob, MsmVanillaRenderState, MsmVanillaModel> {
    /** Problems already logged this game (resource reloads rebuild renderers and would repeat them). */
    private static final Set<String> LOGGED = ConcurrentHashMap.newKeySet();

    private final EntityComponents.AnimatedModel def;
    private final Identifier texture;
    /** Client-only animation records of the mobs this renderer drew (weak: dropped with the entity). */
    private final Map<Mob, Tracker> trackers = new WeakHashMap<>();

    /** Per-mob triggered animation state on the client. */
    private static final class Tracker {
        int lastValue;
        AnimationState[] states;
    }

    MsmVanillaRenderer(EntityRendererProvider.Context context, EntityComponents.AnimatedModel def, MsmVanillaModel model) {
        super(context, model, 0.5f * def.scale());
        this.def = def;
        this.texture = textureLocation(def.texture());
    }

    /** The renderer provider of one entity type. */
    public static EntityRendererProvider<Mob> provider(Identifier typeId, EntityDefinition definition) {
        return context -> new MsmVanillaRenderer(context, definition.components().animatedModel(),
                load(context.getResourceManager(), typeId, definition));
    }

    /** {@code ns:entity/x} to {@code ns:textures/entity/x.png}, as {@code MsmGeoModel}. */
    static Identifier textureLocation(Identifier id) {
        return id.withPath(p -> "textures/" + p + ".png");
    }

    /** {@code ns:entity/x} to {@code ns:geckolib/models/entity/x.geo.json}. */
    static Identifier modelLocation(Identifier id) {
        return id.withPath(p -> "geckolib/models/" + p + ".geo.json");
    }

    /** {@code ns:entity/x} to {@code ns:geckolib/animations/entity/x.animation.json}. */
    static Identifier animationLocation(Identifier id) {
        return id.withPath(p -> "geckolib/animations/" + p + ".animation.json");
    }

    // Loading

    /** Builds the model of a type; never throws: on any failure the model draws nothing and the reason is logged once. */
    static MsmVanillaModel load(ResourceManager resources, Identifier typeId, EntityDefinition definition) {
        try {
            return build(resources, typeId, definition);
        } catch (RuntimeException e) {
            warn(typeId + ": the vanilla renderer could not build the model (" + e + "); the mob is drawn as nothing");
            return MsmVanillaModel.empty();
        }
    }

    private static MsmVanillaModel build(ResourceManager resources, Identifier typeId, EntityDefinition definition) {
        EntityComponents.AnimatedModel def = definition.components().animatedModel();
        Identifier modelFile = modelLocation(def.model());
        Optional<Resource> modelResource = resources.getResource(modelFile);
        if (modelResource.isEmpty()) {
            warn(typeId + ": model file " + modelFile + " not found; the mob is drawn as nothing");
            return MsmVanillaModel.empty();
        }
        GeoMesh mesh;
        try (Reader reader = modelResource.get().openAsReader()) {
            mesh = GeoMeshReader.read(reader);
        } catch (IOException e) {
            warn(typeId + ": model file " + modelFile + " could not be read (" + e.getMessage() + "); the mob is drawn as nothing");
            return MsmVanillaModel.empty();
        }
        for (String problem : mesh.problems()) {
            warn(typeId + ": " + modelFile + ": " + problem);
        }
        GeoModelBaker.Baked baked = GeoModelBaker.bake(mesh);

        ModelPart saddle = null;
        Optional<String> saddleBone = definition.components().rideable().flatMap(EntityComponents.Rideable::saddleBone);
        if (saddleBone.isPresent()) {
            saddle = baked.bones().get(saddleBone.get());
            if (saddle == null) {
                warn(typeId + ": saddle_bone '" + saddleBone.get() + "' is not a bone of " + modelFile);
            }
        }

        GeoAnimationReader.Result clips = readAnimations(resources, typeId, def);
        List<GeoAnimationBaker.Baked> triggered = new ArrayList<>();
        for (MobAnimations.Triggered t : triggerable(definition)) {
            triggered.add(clip(clips, baked, typeId, t.animation()));
        }
        MsmVanillaModel.Animations animations = new MsmVanillaModel.Animations(
                clip(clips, baked, typeId, def.idle().orElse(null)), clip(clips, baked, typeId, def.walk().orElse(null)),
                clip(clips, baked, typeId, def.sit().orElse(null)), clip(clips, baked, typeId, def.fly().orElse(null)),
                clip(clips, baked, typeId, def.swim().orElse(null)), triggered);
        return new MsmVanillaModel(baked.root(), saddle, animations);
    }

    /**
     * The animations file's clips; empty without a file. Without {@code animations} the model id is tried (as
     * GeckoLib does) and a missing file is not a problem.
     */
    private static GeoAnimationReader.Result readAnimations(ResourceManager resources, Identifier typeId,
            EntityComponents.AnimatedModel def) {
        Identifier file = animationLocation(def.animations().orElse(def.model()));
        Optional<Resource> resource = resources.getResource(file);
        if (resource.isEmpty()) {
            if (def.animations().isPresent()) {
                warn(typeId + ": animation file " + file + " not found; nothing is animated");
            }
            return new GeoAnimationReader.Result(List.of(), List.of());
        }
        GeoAnimationReader.Result result;
        try (Reader reader = resource.get().openAsReader()) {
            result = GeoAnimationReader.read(reader);
        } catch (IOException e) {
            warn(typeId + ": animation file " + file + " could not be read (" + e.getMessage() + "); nothing is animated");
            return new GeoAnimationReader.Result(List.of(), List.of());
        }
        for (String problem : result.problems()) {
            warn(typeId + ": " + file + ": " + problem);
        }
        return result;
    }

    /** One named clip baked against the model, or {@code null} for no name or a name the file lacks (logged once). */
    private static GeoAnimationBaker.Baked clip(GeoAnimationReader.Result clips, GeoModelBaker.Baked model,
            Identifier typeId, String name) {
        if (name == null) {
            return null;
        }
        GeoAnimationClip clip = clips.clip(name);
        if (clip == null) {
            warn(typeId + ": animation '" + name + "' is not in the animation file");
            return null;
        }
        GeoAnimationBaker.Baked baked = GeoAnimationBaker.bake(clip, model.bones());
        if (!baked.missing().isEmpty()) {
            warn(typeId + ": animation '" + name + "' names bones the model does not have: "
                    + String.join(", ", baked.missing()));
        }
        return baked;
    }

    /** The triggerable animations in {@code DATA_ANIM} index order, the same list {@link MobAnimations#triggerable()} builds. */
    static List<MobAnimations.Triggered> triggerable(EntityDefinition definition) {
        List<MobAnimations.Triggered> out = new ArrayList<>();
        for (Map.Entry<String, Set<String>> entry : definition.triggerableAnimations().entrySet()) {
            for (String name : entry.getValue()) {
                out.add(new MobAnimations.Triggered(entry.getKey(), name));
            }
        }
        return out;
    }

    private static void warn(String message) {
        if (LOGGED.add(message)) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
        }
    }

    // Rendering

    @Override
    public MsmVanillaRenderState createRenderState() {
        return new MsmVanillaRenderState();
    }

    @Override
    public Identifier getTextureLocation(MsmVanillaRenderState state) {
        return state.texture != null ? state.texture : texture;
    }

    @Override
    public void extractRenderState(Mob entity, MsmVanillaRenderState state, float partialTick) {
        super.extractRenderState(entity, state, partialTick);
        state.texture = texture;
        state.sitting = entity instanceof TamableAnimal tamable && tamable.isInSittingPose();
        double dx = entity.getX() - entity.xo;
        double dy = entity.getY() - entity.yo;
        double dz = entity.getZ() - entity.zo;
        boolean moving = dx * dx + dy * dy + dz * dz > MOVING_SQUARED;
        state.swimming = moving && entity.isInWater();
        state.flying = false;
        state.saddled = false;
        state.triggered = NO_STATES;
        if (!(entity instanceof MsmMob mob)) {
            return;
        }
        try {
            mob.driver().variants().texture().ifPresent(id -> state.texture = textureLocation(id));
            state.flying = moving && !entity.onGround() && !entity.isInWater()
                    && mob.driver().movement().mode() == EntityComponents.MovementMode.FLY;
            state.saddled = mob.driver().riding().saddleBoneVisible();
            state.triggered = triggered(entity, mob);
        } catch (RuntimeException e) {
            warn(entity.getType() + ": the vanilla renderer could not read the mob's state (" + e + ")");
        }
    }

    /** Below this squared distance per tick a mob counts as standing (for {@code fly} and {@code swim}). */
    static final double MOVING_SQUARED = 1.0E-6;

    private static final AnimationState[] NO_STATES = new AnimationState[0];

    /** Updates the mob's triggered animation states from {@code DATA_ANIM} and returns them. */
    private AnimationState[] triggered(Mob entity, MsmMob mob) {
        List<MobAnimations.Triggered> list = mob.driver().animations().triggerable();
        if (list.isEmpty()) {
            return NO_STATES;
        }
        int value = entity.getEntityData().get(mob.animData());
        Tracker tracker = trackers.get(entity);
        if (tracker == null) {
            tracker = new Tracker();
            tracker.lastValue = value;
            tracker.states = new AnimationState[list.size()];
            for (int i = 0; i < tracker.states.length; i++) {
                tracker.states[i] = new AnimationState();
            }
            trackers.put(entity, tracker);
            return tracker.states;
        }
        if (value != tracker.lastValue) {
            tracker.lastValue = value;
            int index = MobAnimations.index(value);
            if (index < tracker.states.length) {
                String controller = list.get(index).controller();
                for (int i = 0; i < tracker.states.length; i++) {
                    if (i != index && list.get(i).controller().equals(controller)) {
                        tracker.states[i].stop();
                    }
                }
                tracker.states[index].start(entity.tickCount);
            }
        }
        List<GeoAnimationBaker.Baked> clips = model.animations().triggered();
        for (int i = 0; i < tracker.states.length && i < clips.size(); i++) {
            GeoAnimationBaker.Baked clip = clips.get(i);
            AnimationState s = tracker.states[i];
            if (clip != null && s.isStarted() && clip.ended(s.getTimeInMillis(entity.tickCount))) {
                s.stop();
            }
        }
        return tracker.states;
    }

    /** {@code msm:animated_model.scale} times the baby scale ({@code ageScale}, the definition's {@code baby_scale}). */
    @Override
    protected void scale(MsmVanillaRenderState state, PoseStack poseStack) {
        float s = def.scale() * state.ageScale;
        poseStack.scale(s, s, s);
    }
}
