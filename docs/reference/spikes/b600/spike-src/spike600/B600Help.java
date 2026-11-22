package dev.mcsupermods.runtime.gametest.spike600;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.Container;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;

/** B600 spike (throwaway): shared helpers. */
final class B600Help {
    static final String NS = "msm_b600";
    static final B600Results R = B600Results.SERVER;

    private B600Help() {
    }

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NS, path);
    }

    static CommandSourceStack op(CommandSourceStack source) {
        return source.withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput();
    }

    static void run(MinecraftServer server, CommandSourceStack source, String command) {
        server.getCommands().performPrefixedCommand(source, command);
    }

    static Holder<Enchantment> enchantment(MinecraftServer server, String id) {
        return server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT)
                .getOrThrow(ResourceKey.create(Registries.ENCHANTMENT, Identifier.parse(id)));
    }

    /** A short key for one stack: the item, its enchantments (stored or not) and, for damageable items, the damage. */
    static String key(ItemStack stack) {
        StringBuilder b = new StringBuilder(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        ItemEnchantments e = stack.get(DataComponents.ENCHANTMENTS);
        ItemEnchantments s = stack.get(DataComponents.STORED_ENCHANTMENTS);
        for (ItemEnchantments ench : new ItemEnchantments[] {e, s}) {
            if (ench != null && !ench.isEmpty()) {
                List<String> parts = new ArrayList<>();
                for (var entry : ench.entrySet()) {
                    parts.add(entry.getKey().unwrapKey().map(k -> k.identifier().getPath()).orElse("?") + entry.getIntValue());
                }
                parts.sort(null);
                b.append('|').append(String.join(",", parts));
            }
        }
        if (stack.isDamageableItem() && stack.getDamageValue() > 0) {
            b.append("|dmg").append(stack.getDamageValue() * 20 / stack.getMaxDamage());
        }
        return b.toString();
    }

    /** Totals per key of the container's stacks, then clears it. */
    static Map<String, Integer> drain(Container c) {
        Map<String, Integer> out = new TreeMap<>();
        for (int i = 0; i < c.getContainerSize(); i++) {
            ItemStack s = c.getItem(i);
            if (!s.isEmpty()) {
                out.merge(key(s), s.getCount(), Integer::sum);
            }
        }
        c.clearContent();
        return out;
    }

    static Container chest(ServerLevel level, BlockPos pos) {
        return (Container) level.getBlockEntity(pos);
    }

    /** A component as key and arguments, recursively, plus its plain string. */
    static Object describe(Component c) {
        Map<String, Object> m = new TreeMap<>();
        m.put("string", c.getString());
        if (c.getContents() instanceof TranslatableContents t) {
            m.put("key", t.getKey());
            List<Object> args = new ArrayList<>();
            for (Object a : t.getArgs()) {
                args.add(a instanceof Component ac ? describe(ac) : String.valueOf(a));
            }
            m.put("args", args);
        }
        if (!c.getStyle().isEmpty()) {
            m.put("style", c.getStyle().toString());
        }
        if (!c.getSiblings().isEmpty()) {
            m.put("siblings", c.getSiblings().stream().map(B600Help::describe).toList());
        }
        return m;
    }
}
