package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.MsmRuntime;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentTarget;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;

/**
 * The persistent Fabric data attachment {@code msm_runtime:script_data} (ADR 0062 D3) holding {@link ScriptData}:
 * on entities ({@code Entity.data}; {@code copyOnDeath}, so a player keeps it on respawn and a converted mob keeps
 * it) and on the server's global attachments ({@code msm.storage}; Fabric saves them in the world's
 * {@code data/fabric/attachments.dat}). Not synced to clients. Registered once, from {@code MsmRuntime}.
 */
public final class ScriptDataAttachment {
    public static final Identifier ID = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "script_data");

    public static final AttachmentType<ScriptData> TYPE = AttachmentRegistry.create(ID,
            builder -> builder.persistent(ScriptData.CODEC).copyOnDeath());

    private ScriptDataAttachment() {}

    /** Registers the attachment type (class initialisation); called from the mod initialiser. */
    public static void register() {
        MsmRuntime.LOGGER.debug("[{}] registered attachment {}", MsmRuntime.MOD_ID, TYPE.identifier());
    }

    /** The data on a target, or {@link ScriptData#EMPTY}. */
    public static ScriptData get(AttachmentTarget target) {
        return target.getAttachedOrElse(TYPE, ScriptData.EMPTY);
    }

    /** Stores the data; empty data removes the attachment, so nothing is saved for it. */
    public static void set(AttachmentTarget target, ScriptData data) {
        if (data.isEmpty()) {
            target.removeAttached(TYPE);
        } else {
            target.setAttached(TYPE, data);
        }
    }

    /** Where {@code msm.storage} lives: the server's global attachments (ADR 0062 D3 finding). */
    public static AttachmentTarget world(MinecraftServer server) {
        return server.globalAttachments();
    }
}
