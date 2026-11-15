package dev.mcsupermods.runtime.gametest.spike3;

import dev.mcsupermods.runtime.registry.MsmAnimal;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.HasCustomInventoryScreen;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.level.Level;

/** B469 spike (throwaway): a rideable runtime {@code animal} body with a chest inventory opened by the inventory key. */
public class Spike3Mule extends MsmAnimal implements HasCustomInventoryScreen {
    public static final List<String> OPENS = new CopyOnWriteArrayList<>();
    public final SimpleContainer inventory = new SimpleContainer(27);

    public Spike3Mule(EntityType<? extends TamableAnimal> type, Level level) {
        super(type, level);
    }

    @Override
    public void openCustomInventoryScreen(Player player) {
        OPENS.add("openCustomInventoryScreen by " + player.getName().getString() + " clientSide=" + level().isClientSide()
                + " passenger=" + player.isPassenger() + " vehicle=" + (player.getVehicle() == this));
        if (!level().isClientSide()) {
            player.openMenu(new SimpleMenuProvider((id, inv, p) -> ChestMenu.threeRows(id, inv, inventory), getDisplayName()));
        }
    }
}
