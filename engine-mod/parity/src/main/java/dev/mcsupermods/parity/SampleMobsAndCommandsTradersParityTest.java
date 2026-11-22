package dev.mcsupermods.parity;

import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.animal.parrot.Parrot;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;

/**
 * Behaviour parity of the kind merchant's trader (ADR 0107 D1 to D3) and the perch owl's shoulder riding (ADR 0109 D2)
 * in {@code fixtures/sample-mobs-and-commands} (B541), on content jars only: the Java project eject does not include
 * traders or shoulder riding yet (B537b, {@code export.not-in-eject}), so the ejected run's filter
 * {@code sample_mobs_and_commands_parity_test_*} does not match this class, while a content jar's
 * {@code sample_mobs_and_commands_*} does. When the eject covers them, these tests move into
 * {@link SampleMobsAndCommandsParityTest}. Vanilla and Fabric API only.
 *
 * <p>Covered: the merchant's prices from its own trades (10 emeralds for bread, 20 for cooked beef); a hit raising them
 * for the player who hit (by vanilla's reputation discounts, 0.05 and 0.2: 12 and 25) and for nobody else; a poppy given
 * as a gift bringing them back; the perch owl sitting on its owner's right shoulder only (saved {@code PerchSide}) and
 * staying down while a parrot has that shoulder.
 */
public class SampleMobsAndCommandsTradersParityTest {
    private static final BlockPos MID = new BlockPos(4, 1, 4);

    private static MerchantOffer offer(GameTestHelper helper, MerchantOffers offers, Item result) {
        for (MerchantOffer o : offers) {
            if (o.getResult().is(result)) {
                return o;
            }
        }
        throw helper.assertionException("no offer of " + result + " in " + SampleVillagersParityTest.describe(offers));
    }

    /** The emeralds the bread and the cooked beef cost {@code player}, read from the menu it opens. */
    private static List<Integer> costs(GameTestHelper helper, ServerPlayer player, Mob merchant) {
        MerchantMenu menu = SampleVillagersParityTest.open(helper, player, merchant);
        List<Integer> out = List.of(offer(helper, menu.getOffers(), Items.BREAD).getCostA().getCount(),
                offer(helper, menu.getOffers(), Items.COOKED_BEEF).getCostA().getCount());
        player.closeContainer();
        return out;
    }

    @GameTest(maxTicks = 20)
    public void aHitRaisesTheMerchantsPricesForThatPlayerAndAGiftBringsThemBack(GameTestHelper helper) {
        SampleMobsAndCommandsParityTest.floor(helper);
        Mob merchant = helper.spawnWithNoFreeWill(SampleMobsAndCommandsParityTest.<Mob>type(helper, "kind_merchant"), MID);
        try (ParityEars ann = SampleVillagersParityTest.player(helper, MID.east(2), "msm-mc-ann");
                ParityEars bob = SampleVillagersParityTest.player(helper, MID.west(2), "msm-mc-bob")) {
            helper.assertValueEqual(costs(helper, ann.player, merchant), List.of(10, 20), "prices before the hit");
            ann.player.attack(merchant);
            helper.assertTrue(merchant.isAlive(), "the merchant died of one hit");
            helper.assertValueEqual(costs(helper, ann.player, merchant), List.of(12, 25), "prices for the player who hit");
            helper.assertValueEqual(costs(helper, bob.player, merchant), List.of(10, 20), "prices for another player");
            SampleVillagersParityTest.use(ann.player, merchant, new ItemStack(Items.POPPY, 2), false);
            helper.assertFalse(ann.player.containerMenu instanceof MerchantMenu, "the gift opened the menu");
            helper.assertValueEqual(ann.player.getMainHandItem().getCount(), 1, "poppies left after the gift");
            ann.player.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            helper.assertValueEqual(costs(helper, ann.player, merchant), List.of(10, 20), "prices after the gift");
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 300)
    public void thePerchOwlSitsOnItsOwnersRightShoulderOnly(GameTestHelper helper) {
        SampleMobsAndCommandsParityTest.floor(helper);
        Mob owl = helper.spawn(SampleMobsAndCommandsParityTest.<Mob>type(helper, "perch_owl"), new BlockPos(1, 1, 4));
        Mob blocked = helper.spawn(SampleMobsAndCommandsParityTest.<Mob>type(helper, "perch_owl"), new BlockPos(1, 1, 1));
        ParityEars ears = SampleVillagersParityTest.player(helper, new BlockPos(5, 1, 4), "msm-mc-owl");
        ParityEars other = SampleVillagersParityTest.player(helper, new BlockPos(5, 1, 1), "msm-mc-parrot");
        ((TamableAnimal) owl).tame(ears.player);
        ((TamableAnimal) blocked).tame(other.player);
        other.player.setShoulderParrotRight(Optional.of(Parrot.Variant.BLUE));
        helper.onEachTick(() -> {
            ears.player.setOnGround(true);
            other.player.setOnGround(true);
            helper.assertFalse(SampleVillagersParityTest.saved(helper, blocked).getBooleanOr("Perched", false),
                    "the owl sat on a shoulder a parrot has");
            if (SampleVillagersParityTest.saved(helper, owl).getBooleanOr("Perched", false)) {
                helper.assertValueEqual(SampleVillagersParityTest.saved(helper, owl).getStringOr("PerchSide", ""), "right", "the owl's side");
                helper.assertTrue(owl.position().distanceTo(ears.player.position()) < 1.6, "the owl is not at the owner: " + owl.position());
                other.player.setShoulderParrotRight(Optional.empty());
                ears.close();
                other.close();
                helper.succeed();
            }
        });
    }
}
