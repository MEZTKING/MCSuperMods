package dev.mcsupermods.runtime.scripting;

import com.google.gson.JsonElement;
import net.fabricmc.fabric.api.attachment.v1.AttachmentTarget;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ScriptRuntime;

/**
 * {@code DataStore} (ADR 0062 D1, D2): the saved data of one script namespace on one holder, an entity
 * ({@code Entity.data}) or the server ({@code msm.storage}). Values are copied in and out as JSON
 * ({@link ScriptJson}); a value that is not JSON is a {@code TypeError}, a key or size over the limits of
 * {@link ScriptData} a {@code RangeError}, and in both cases the stored data stay as they were.
 */
final class DataStore {
    private DataStore() {}

    /** One namespace's store on one holder; {@code label} names it in limit errors. */
    record Target(AttachmentTarget holder, String namespace, int limitBytes, String label) {}

    static final ScriptType TYPE = ScriptType.of("DataStore")
            .method("get", 1, 1, Target.class, (api, t, args) -> {
                JsonElement value = run(() -> ScriptDataAttachment.get(t.holder()).get(t.namespace(), key(args)));
                if (value == null) {
                    return null;
                }
                Object script = ScriptJson.toScript(Context.getCurrentContext(), api.scope(), value);
                return script == null ? ScriptValues.NULL : script;
            })
            .method("set", 2, 2, Target.class, (api, t, args) -> {
                String key = key(args);
                JsonElement value = ScriptJson.fromScript(args[1]);
                run(() -> {
                    ScriptData next = ScriptDataAttachment.get(t.holder()).with(t.namespace(), key, value, t.limitBytes(), t.label());
                    ScriptDataAttachment.set(t.holder(), next);
                    return null;
                });
                return null;
            })
            .method("remove", 1, 1, Target.class, (api, t, args) -> run(() -> {
                ScriptData current = ScriptDataAttachment.get(t.holder());
                ScriptData next = current.without(t.namespace(), key(args));
                if (next == current) {
                    return false;
                }
                ScriptDataAttachment.set(t.holder(), next);
                return true;
            }))
            .method("has", 1, 1, Target.class, (api, t, args) ->
                    run(() -> ScriptDataAttachment.get(t.holder()).has(t.namespace(), key(args))))
            .method("keys", 0, 0, Target.class, (api, t, args) ->
                    api.array(ScriptDataAttachment.get(t.holder()).keys(t.namespace()).toArray()));

    /** The key argument; a {@code RangeError} when it is longer than {@value ScriptData#MAX_KEY_LENGTH} characters. */
    private static String key(Object[] args) {
        String key = ScriptValues.string(args, 0, "key");
        run(() -> {
            ScriptData.checkKey(key);
            return null;
        });
        return key;
    }

    private interface Op<R> {
        R run();
    }

    /** Runs an operation; a broken limit becomes a script {@code RangeError}. */
    private static <R> R run(Op<R> op) {
        try {
            return op.run();
        } catch (ScriptData.LimitException e) {
            throw ScriptRuntime.constructError("RangeError", e.getMessage());
        }
    }
}
