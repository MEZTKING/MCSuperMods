package dev.mcsupermods.runtime.hud;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.net.HudPayload;
import java.util.Arrays;

/**
 * What one viewer knows of the HUD elements' synced values (ADR 0089 D3): the client keeps one ({@code HudClient}); the
 * server's GameTests use one to check the payloads. No client class is named here, so a dedicated server can load it.
 *
 * <p>Slots: element {@code i} (its index in the sorted HUD id list, {@link HudServer#ids()}) has slot {@code i} for its
 * value and slot {@code count + i} for its {@code max} when that is read from a server-computed value. A payload entry
 * sets the slot's number or text; an entry with neither, and without {@code visible}, clears the slot (the value is no
 * longer known, as when the viewer leaves a vehicle); {@code visible} (for slots below {@code count} only) records a
 * {@code show_hud} or {@code hide_hud}. A payload whose hash is not this side's ({@link #hash()}) is ignored and the
 * first one logs a warning; an index beyond the slots is ignored.
 */
public final class HudState {
    private final int count;
    private final int hash;
    private final Object[] values;
    private final Boolean[] visible;
    private boolean warned;
    private int ignored;

    /**
     * @param count the number of HUD elements this side knows
     * @param hash  the hash of this side's HUD id list ({@link HudServer#hashOf})
     */
    public HudState(int count, int hash) {
        this.count = count;
        this.hash = hash;
        this.values = new Object[count * 2];
        this.visible = new Boolean[count];
    }

    public int count() {
        return count;
    }

    public int hash() {
        return hash;
    }

    /** Applies one payload; false (and nothing changes) when its hash is not this side's. */
    public boolean apply(HudPayload payload) {
        if (payload.hash() != hash) {
            ignored++;
            if (!warned) {
                warned = true;
                MsmRuntime.LOGGER.warn("[{}] ignoring HUD values from the server: its HUD elements differ from this game's (hash {} here, {} "
                        + "there); install the same mods on both sides", MsmRuntime.MOD_ID, hash, payload.hash());
            }
            return false;
        }
        for (HudPayload.Value v : payload.values()) {
            int slot = v.index();
            if (slot >= values.length) {
                continue;
            }
            if (v.number().isPresent()) {
                values[slot] = v.number().get();
            } else if (v.text().isPresent()) {
                values[slot] = v.text().get();
            } else if (v.visible().isEmpty()) {
                values[slot] = null;
            }
            if (v.visible().isPresent() && slot < count) {
                visible[slot] = v.visible().get();
            }
        }
        return true;
    }

    /** The value of slot {@code slot}: a {@link Double}, a {@link String} or null (not known). */
    public Object value(int slot) {
        return slot >= 0 && slot < values.length ? values[slot] : null;
    }

    /** Element {@code index}'s visibility from {@code show_hud} or {@code hide_hud}, or null (its definition decides). */
    public Boolean visible(int index) {
        return index >= 0 && index < count ? visible[index] : null;
    }

    /** How many payloads were ignored for their hash. */
    public int ignored() {
        return ignored;
    }

    /** Forgets every value and the warning (leaving a server). */
    public void clear() {
        Arrays.fill(values, null);
        Arrays.fill(visible, null);
        warned = false;
    }
}
