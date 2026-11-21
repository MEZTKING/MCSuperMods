package dev.mcsupermods.runtime.mixin;

/**
 * Version seam (ADR 0038 D2): which version-only Mixins this Minecraft version applies. Plain booleans, no Minecraft
 * types, because {@link MsmMixinPlugin} asks before the game is loaded.
 */
final class MixinVersions {
    private MixinVersions() {}

    /** Whether {@code EntityFluidMixin} (ADR 0099 amendment) applies: 26.4 needs it. */
    static boolean entityFluid() {
        return true;
    }
}
