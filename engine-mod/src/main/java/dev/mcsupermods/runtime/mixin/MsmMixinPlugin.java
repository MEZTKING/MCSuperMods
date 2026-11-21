package dev.mcsupermods.runtime.mixin;

import java.util.List;
import java.util.Set;
import org.objectweb.asm.tree.ClassNode;
import org.spongepowered.asm.mixin.extensibility.IMixinConfigPlugin;
import org.spongepowered.asm.mixin.extensibility.IMixinInfo;

/**
 * Adds the Mixins that exist for one Minecraft version only to {@code msm_runtime.mixins.json} (ADR 0038 D2). The config
 * lists the Mixins of every version; {@link #getMixins} adds the others from the {@link MixinVersions} seam. Mixin loads
 * a listed class before it asks {@link #shouldApplyMixin}, so a class that exists on one version only cannot be listed in
 * the file. Touches no Minecraft class: it runs before the game is loaded.
 */
public final class MsmMixinPlugin implements IMixinConfigPlugin {
    @Override
    public void onLoad(String mixinPackage) {}

    @Override
    public String getRefMapperConfig() {
        return null;
    }

    @Override
    public boolean shouldApplyMixin(String targetClassName, String mixinClassName) {
        return true;
    }

    @Override
    public void acceptTargets(Set<String> myTargets, Set<String> otherTargets) {}

    @Override
    public List<String> getMixins() {
        // Relative to the config's package.
        return MixinVersions.entityFluid() ? List.of("EntityFluidMixin") : null;
    }

    @Override
    public void preApply(String targetClassName, ClassNode targetClass, String mixinClassName, IMixinInfo mixinInfo) {}

    @Override
    public void postApply(String targetClassName, ClassNode targetClass, String mixinClassName, IMixinInfo mixinInfo) {}
}
