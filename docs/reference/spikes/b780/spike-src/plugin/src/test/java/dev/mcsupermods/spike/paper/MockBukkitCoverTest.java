package dev.mcsupermods.spike.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.block.Block;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.inventory.ClickType;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockbukkit.mockbukkit.MockBukkit;
import org.mockbukkit.mockbukkit.ServerMock;
import org.mockbukkit.mockbukkit.entity.PlayerMock;

/** B780 P7: what MockBukkit (v26.3) covers of the games extras, each capability its own test. */
class MockBukkitCoverTest {
    private ServerMock server;

    /** A stand-in plugin so listeners can be registered without the spike's bootstrap. */
    public static class Host extends JavaPlugin {
    }

    @BeforeEach
    void setUp() {
        server = MockBukkit.mock();
    }

    @AfterEach
    void tearDown() {
        MockBukkit.unmock();
    }

    @Test
    void loadsTheSpikePluginWithItsLifecycleHandlers() {
        SpikePlugin plugin = MockBukkit.load(SpikePlugin.class);
        assertTrue(plugin.isEnabled());
        server.getScheduler().performTicks(2);
    }

    @Test
    void bansAPlayerUntilATime() {
        PlayerMock p = server.addPlayer("Ann");
        p.ban("out for 5 seconds", Duration.ofSeconds(5), "test", true);
        assertTrue(Bukkit.getOfflinePlayer("Ann").isBanned());
        assertFalse(p.isOnline());
    }

    @Test
    void cancelsABreakInABox() {
        Host host = MockBukkit.load(Host.class);
        server.getPluginManager().registerEvents(new Listener() {
            @EventHandler
            public void onBreak(BlockBreakEvent e) {
                if (e.getBlock().getX() >= 0 && e.getBlock().getX() <= 4) {
                    e.setCancelled(true);
                }
            }
        }, host);
        World w = server.addSimpleWorld("world");
        PlayerMock p = server.addPlayer();
        Block inside = w.getBlockAt(2, 64, 2);
        inside.setType(Material.STONE);
        Block outside = w.getBlockAt(9, 64, 2);
        outside.setType(Material.STONE);
        assertTrue(p.simulateBlockBreak(inside) == null || inside.getType() == Material.STONE);
        assertEquals(Material.STONE, inside.getType());
        p.simulateBlockBreak(outside);
        assertEquals(Material.AIR, outside.getType());
    }

    @Test
    void clicksAMenuSlot() {
        Host host = MockBukkit.load(Host.class);
        int[] clicked = {-1};
        server.getPluginManager().registerEvents(new Listener() {
            @EventHandler
            public void onClick(InventoryClickEvent e) {
                clicked[0] = e.getSlot();
                e.setCancelled(true);
            }
        }, host);
        PlayerMock p = server.addPlayer();
        Inventory inv = Bukkit.createInventory(null, 27);
        inv.setItem(11, new ItemStack(Material.IRON_SWORD));
        var view = p.openInventory(inv);
        p.simulateInventoryClick(view, ClickType.LEFT, 11);
        assertEquals(11, clicked[0]);
    }

    @Test
    void runsADataPackFunction() {
        // MockBukkit has no data packs or vanilla command tree: the console command is not known.
        assertTrue(Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "function msm_spike:hello"));
    }

    @Test
    void makesAWorldFromACreator() {
        World w = WorldCreator.ofKey(new NamespacedKey("msm_spike", "arena_1")).createWorld();
        assertNotNull(w);
    }
}
