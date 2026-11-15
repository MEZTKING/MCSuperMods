package dev.mcsupermods.runtime.client.vehicle;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.client.vanilla.GeoAnimationBaker;
import dev.mcsupermods.runtime.client.vanilla.GeoModelBaker;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.model.GeoAnimationClip;
import dev.mcsupermods.runtime.model.GeoAnimationReader;
import dev.mcsupermods.runtime.model.GeoMesh;
import dev.mcsupermods.runtime.model.GeoMeshReader;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicles;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.util.Mth;

/**
 * The runtime's own vehicle renderer (ADR 0090 D10), never GeckoLib, so vehicles draw on every version and without
 * GeckoLib. The provider reads {@code model.geometry} ({@code assets/<ns>/geckolib/models/<path>.geo.json}) and
 * {@code model.animations} ({@code assets/<ns>/geckolib/animations/<path>.animation.json}) through the context's resource
 * manager, so a resource reload rebuilds it, and bakes them with ADR 0072's {@link GeoModelBaker} and
 * {@link GeoAnimationBaker}. A missing or broken file draws nothing (the shadow stays) and each problem is logged once per
 * game; nothing here throws into the render loop.
 *
 * <p>Drawing: the hull turned by its yaw and pitch, then the hurt wobble about its length (as vanilla's boats wobble:
 * {@code sin(t) · t · share of health lost · 40 / 10} degrees, {@code t} the hurt time left, signed by the hurt direction),
 * then the model in vanilla's model space at {@code model.scale}, with the paint's texture ({@code DATA_PAINT}). The
 * clips are named {@code idle} and {@code moving}, or end in {@code .idle} and {@code .moving} (Bedrock's
 * {@code animation.<name>.idle}).
 */
public class MsmVehicleRenderer extends EntityRenderer<MsmVehicle, VehicleRenderState> {
    /** Problems already logged this game (resource reloads rebuild renderers and would repeat them). */
    private static final Set<String> LOGGED = ConcurrentHashMap.newKeySet();
    /** Vanilla's model space has the model's feet 24 pixels below its origin. */
    private static final float FEET = 1.501f;

    private final VehicleModel model;
    private final float scale;

    MsmVehicleRenderer(EntityRendererProvider.Context context, MsmVehicles.Entry entry, VehicleModel model) {
        super(context);
        this.model = model;
        this.scale = entry.definition().model().scale();
        this.shadowRadius = Math.min(entry.definition().width() * 0.5f, 2f);
    }

    /** The renderer provider of one vehicle type: a new instance per type (on 26.4 a client registry refuses repeats). */
    public static EntityRendererProvider<MsmVehicle> provider(MsmVehicles.Entry entry) {
        return context -> new MsmVehicleRenderer(context, entry, load(context.getResourceManager(), entry));
    }

    /** The model this renderer draws (client GameTests). */
    public VehicleModel model() {
        return model;
    }

    /** {@code ns:entity/x} to {@code ns:textures/entity/x.png}. */
    public static Identifier textureLocation(Identifier id) {
        return id.withPath(p -> "textures/" + p + ".png");
    }

    static Identifier modelLocation(Identifier id) {
        return id.withPath(p -> "geckolib/models/" + p + ".geo.json");
    }

    static Identifier animationLocation(Identifier id) {
        return id.withPath(p -> "geckolib/animations/" + p + ".animation.json");
    }

    // Loading

    /** Builds the model of a type; never throws: on any failure the model draws nothing and the reason is logged once. */
    static VehicleModel load(ResourceManager resources, MsmVehicles.Entry entry) {
        try {
            return build(resources, entry);
        } catch (RuntimeException e) {
            warn(entry.id() + ": the vehicle renderer could not build the model (" + e + "); the vehicle is drawn as nothing");
            return VehicleModel.empty();
        }
    }

    private static VehicleModel build(ResourceManager resources, MsmVehicles.Entry entry) {
        Identifier typeId = entry.id();
        VehicleDefinition.Model def = entry.definition().model();
        Identifier geometry = Identifier.tryParse(def.geometry());
        if (geometry == null) {
            warn(typeId + ": model.geometry '" + def.geometry() + "' is not an id; the vehicle is drawn as nothing");
            return VehicleModel.empty();
        }
        Identifier modelFile = modelLocation(geometry);
        Optional<Resource> modelResource = resources.getResource(modelFile);
        if (modelResource.isEmpty()) {
            warn(typeId + ": model file " + modelFile + " not found; the vehicle is drawn as nothing");
            return VehicleModel.empty();
        }
        GeoMesh mesh;
        try (Reader reader = modelResource.get().openAsReader()) {
            mesh = GeoMeshReader.read(reader);
        } catch (IOException e) {
            warn(typeId + ": model file " + modelFile + " could not be read (" + e.getMessage() + "); the vehicle is drawn as nothing");
            return VehicleModel.empty();
        }
        for (String problem : mesh.problems()) {
            warn(typeId + ": " + modelFile + ": " + problem);
        }
        GeoModelBaker.Baked baked = GeoModelBaker.bake(mesh);
        Map<String, ModelPart> parts = baked.bones();

        Optional<VehicleDefinition.Parts> spec = entry.definition().parts();
        Optional<VehicleDefinition.Turret> turret = entry.definition().turret();
        VehicleModel.Bones bones = new VehicleModel.Bones(
                bones(parts, typeId, modelFile, "parts.wheels", spec.map(VehicleDefinition.Parts::wheels).orElse(List.of())),
                bones(parts, typeId, modelFile, "parts.steering", spec.map(VehicleDefinition.Parts::steering).orElse(List.of())),
                bones(parts, typeId, modelFile, "parts.rotors", spec.map(VehicleDefinition.Parts::rotors).orElse(List.of())),
                bones(parts, typeId, modelFile, "parts.propellers", spec.map(VehicleDefinition.Parts::propellers).orElse(List.of())),
                turret.map(t -> bone(parts, typeId, modelFile, "turret.bone", t.bone())).orElse(null),
                turret.flatMap(VehicleDefinition.Turret::pitchBone).map(b -> bone(parts, typeId, modelFile, "turret.pitch_bone", b))
                        .orElse(null));

        GeoAnimationBaker.Baked idle = null;
        GeoAnimationBaker.Baked moving = null;
        if (def.animations().isPresent()) {
            Identifier animations = Identifier.tryParse(def.animations().get());
            GeoAnimationReader.Result clips = animations == null ? null : readAnimations(resources, typeId, animations);
            if (animations == null) {
                warn(typeId + ": model.animations '" + def.animations().get() + "' is not an id; nothing is animated");
            } else if (clips != null) {
                idle = clip(clips, baked, typeId, "idle");
                moving = clip(clips, baked, typeId, "moving");
                if (idle == null && moving == null) {
                    warn(typeId + ": " + animationLocation(animations) + " has neither an 'idle' nor a 'moving' animation");
                }
            }
        }
        return new VehicleModel(baked.root(), bones, idle, moving);
    }

    private static List<ModelPart> bones(Map<String, ModelPart> parts, Identifier typeId, Identifier file, String field, List<String> names) {
        List<ModelPart> out = new ArrayList<>();
        for (String name : names) {
            ModelPart part = bone(parts, typeId, file, field, name);
            if (part != null) {
                out.add(part);
            }
        }
        return List.copyOf(out);
    }

    private static ModelPart bone(Map<String, ModelPart> parts, Identifier typeId, Identifier file, String field, String name) {
        ModelPart part = parts.get(name);
        if (part == null) {
            warn(typeId + ": " + field + " names '" + name + "', which is not a bone of " + file);
        }
        return part;
    }

    private static GeoAnimationReader.Result readAnimations(ResourceManager resources, Identifier typeId, Identifier id) {
        Identifier file = animationLocation(id);
        Optional<Resource> resource = resources.getResource(file);
        if (resource.isEmpty()) {
            warn(typeId + ": animation file " + file + " not found; nothing is animated");
            return null;
        }
        GeoAnimationReader.Result result;
        try (Reader reader = resource.get().openAsReader()) {
            result = GeoAnimationReader.read(reader);
        } catch (IOException e) {
            warn(typeId + ": animation file " + file + " could not be read (" + e.getMessage() + "); nothing is animated");
            return null;
        }
        for (String problem : result.problems()) {
            warn(typeId + ": " + file + ": " + problem);
        }
        return result;
    }

    /** The clip called {@code name} or ending in {@code .name}, baked; {@code null} when the file has none. */
    private static GeoAnimationBaker.Baked clip(GeoAnimationReader.Result clips, GeoModelBaker.Baked model, Identifier typeId, String name) {
        GeoAnimationClip clip = clips.clip(name);
        if (clip == null) {
            clip = clips.clips().stream().filter(c -> c.name().endsWith("." + name)).findFirst().orElse(null);
        }
        if (clip == null) {
            return null;
        }
        GeoAnimationBaker.Baked baked = GeoAnimationBaker.bake(clip, model.bones());
        if (!baked.missing().isEmpty()) {
            warn(typeId + ": animation '" + clip.name() + "' names bones the model does not have: " + String.join(", ", baked.missing()));
        }
        return baked;
    }

    static void warn(String message) {
        if (LOGGED.add(message)) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
        }
    }

    // Rendering

    @Override
    public VehicleRenderState createRenderState() {
        return new VehicleRenderState();
    }

    @Override
    public void extractRenderState(MsmVehicle vehicle, VehicleRenderState state, float partialTick) {
        super.extractRenderState(vehicle, state, partialTick);
        state.yRot = Mth.rotLerp(partialTick, vehicle.yRotO, vehicle.getYRot());
        state.xRot = Mth.lerp(partialTick, vehicle.xRotO, vehicle.getXRot());
        try {
            state.texture = textureLocation(vehicle.paint().texture());
            state.wobble = wobble(vehicle.getHurtTime() - partialTick, vehicle.getDamage() - partialTick,
                    vehicle.definition().health().max(), vehicle.getHurtDir());
            VehicleClient.Motion motion = VehicleClient.motion(vehicle);
            state.moving = motion.moving;
            state.wheelAngle = Mth.lerp(partialTick, motion.wheelO, motion.wheel);
            state.steering = Mth.lerp(partialTick, motion.steerO, motion.steer);
            state.rotorAngle = Mth.lerp(partialTick, motion.rotorO, motion.rotor);
            state.propellerAngle = Mth.lerp(partialTick, motion.propellerO, motion.propeller);
            float[] turret = LocalTurret.angles(vehicle, partialTick);
            state.turretYaw = turret[0];
            state.turretPitch = turret[1];
        } catch (RuntimeException e) {
            warn(vehicle.getType() + ": the vehicle renderer could not read the vehicle's state (" + e + ")");
        }
    }

    /**
     * The hurt wobble in degrees: {@code sin(t) · t · lost · 4 · direction}, where {@code t} is the hurt time left (ticks)
     * and {@code lost} the share of {@code max} health lost (so a nearly wrecked vehicle wobbles as a nearly broken boat
     * does at 40 damage); 0 when {@code t} is not positive.
     */
    public static float wobble(float hurtTime, float damage, float max, int direction) {
        if (hurtTime <= 0) {
            return 0;
        }
        float lost = Math.max(0, damage) / Math.max(1, max);
        return Mth.sin(hurtTime) * hurtTime * lost * 4f * direction;
    }

    @Override
    public void submit(VehicleRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
        if (state.texture != null && !state.isInvisible) {
            poseStack.pushPose();
            poseStack.rotate(Axis.YP.rotationDegrees(180f - state.yRot));
            poseStack.rotate(Axis.XP.rotationDegrees(-state.xRot));
            if (state.wobble != 0) {
                poseStack.rotate(Axis.ZP.rotationDegrees(state.wobble));
            }
            poseStack.scale(-scale, -scale, scale);
            poseStack.translate(0f, -FEET, 0f);
            model.setupAnim(state);
            collector.submitModel(model, state, poseStack, model.renderType(state.texture), state.lightCoords, OverlayTexture.NO_OVERLAY,
                    state.outlineColor);
            poseStack.popPose();
        }
        super.submit(state, poseStack, collector, camera);
    }
}
