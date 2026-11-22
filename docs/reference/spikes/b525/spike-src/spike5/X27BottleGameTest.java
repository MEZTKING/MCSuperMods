package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * B525 spike (throwaway), X27: a glass bottle used (the real use path, {@code ServerPlayerGameMode.useItem}) while
 * looking straight down at a 3 by 3 pool: of the spike's water-like goo without and with the glass bottle callback, of
 * the runtime's water-like fluid and of vanilla water; then the goo bottle drunk to the end by a hungry player ticked
 * as the server ticks a connected one.
 */
public class X27BottleGameTest {
    static final String POOL = X25MixingGameTest.POOL;

    static void basin(GameTestHelper helper, int x0, Block fluid) {
        for (int x = x0; x < x0 + 3; x++) {
            for (int z = 9; z < 12; z++) {
                helper.setBlock(new BlockPos(x, 1, z), fluid);
            }
        }
        for (int x = x0 - 1; x <= x0 + 3; x++) {
            for (int z = 8; z <= 12; z++) {
                if (x == x0 - 1 || x == x0 + 3 || z == 8 || z == 12) {
                    helper.setBlock(new BlockPos(x, 1, z), Blocks.STONE);
                }
            }
        }
    }

    static String fill(GameTestHelper helper, ServerPlayer p, int x0) {
        p.snapTo(helper.absoluteVec(new Vec3(x0 + 1.5, 2.0, 10.5)), 0f, 90f);
        var result = B525Help.useItem(helper, p, new ItemStack(Items.GLASS_BOTTLE));
        ItemStack hand = p.getItemInHand(InteractionHand.MAIN_HAND);
        String potion = hand.has(DataComponents.POTION_CONTENTS) ? " potion " + hand.get(DataComponents.POTION_CONTENTS) : "";
        ItemStack other = ItemStack.EMPTY;
        for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
            ItemStack s = p.getInventory().getItem(i);
            if (!s.isEmpty() && !s.is(Items.GLASS_BOTTLE) && i != p.getInventory().getSelectedSlot()) {
                other = s;
            }
        }
        String r = result + ", hand " + B525Help.item(hand) + potion + ", elsewhere " + B525Help.item(other);
        p.getInventory().clearContent();
        return r;
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x27Bottles(GameTestHelper helper) {
        Map<String, Object> m = new TreeMap<>();
        basin(helper, 2, B525Mod.block("mix_goo"));
        basin(helper, 8, X25MixingGameTest.runtime("fluid_water"));
        basin(helper, 14, Blocks.WATER);
        B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(3, 2, 10), GameType.SURVIVAL, "Drinker");
        ServerPlayer p = ears.player;
        R.section("X27.fill", () -> {
            B525Mod.bottleRoute = false;
            m.put("goo.routeOff", fill(helper, p, 2));
            m.put("runtimeWaterLike.routeOff", fill(helper, p, 8));
            m.put("vanillaWater.routeOff", fill(helper, p, 14));
            B525Mod.bottleRoute = true;
            m.put("goo.routeOn", fill(helper, p, 2));
            m.put("goo.sourceStillThere", B525Help.name(helper.getBlockState(new BlockPos(3, 1, 10))));
            B525Mod.bottleRoute = false;
            m.put("heard", ears.heard());
        });
        // Drinking: hungry survival player, goo bottle in hand, the use started by the real path, then ticked.
        int[] events = new int[1];
        R.section("X27.drink", () -> {
            p.snapTo(helper.absoluteVec(new Vec3(20.5, 1.0, 20.5)), 0f, 0f);
            p.getFoodData().setFoodLevel(10);
            events[0] = B525Mod.EVENTS.size();
            m.put("drink.use", String.valueOf(B525Help.useItem(helper, p, new ItemStack(B525Mod.item("goo_bottle")))));
            m.put("drink.isUsing", p.isUsingItem());
            m.put("drink.useDuration", p.getUseItemRemainingTicks());
        });
        List<String> ticks = new ArrayList<>();
        for (int t = 1; t <= 40; t++) {
            int tt = t;
            helper.runAfterDelay(t, () -> {
                if (p.isUsingItem() || tt == 1) {
                    p.doTick();
                    if (!p.isUsingItem()) {
                        ticks.add("finished after " + tt + " ticks");
                    }
                }
            });
        }
        helper.runAfterDelay(45, () -> {
            R.section("X27.drink", () -> {
                m.put("drink.ticks", ticks);
                m.put("drink.hand", B525Help.item(p.getItemInHand(InteractionHand.MAIN_HAND)));
                m.put("drink.speed", p.hasEffect(MobEffects.SPEED) ? p.getEffect(MobEffects.SPEED).toString() : "none");
                m.put("drink.food", p.getFoodData().getFoodLevel());
                m.put("drink.events", List.copyOf(B525Mod.EVENTS.subList(events[0], B525Mod.EVENTS.size())));
            });
            R.put("X27", m);
            ears.close();
            helper.succeed();
        });
    }
}
