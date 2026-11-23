package dev.mcsupermods.spike.paper;

import com.mojang.brigadier.Command;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import io.papermc.paper.ban.BanListType;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import io.papermc.paper.command.brigadier.Commands;
import io.papermc.paper.dialog.Dialog;
import io.papermc.paper.event.player.PlayerCustomClickEvent;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import io.papermc.paper.registry.data.dialog.ActionButton;
import io.papermc.paper.registry.data.dialog.DialogBase;
import io.papermc.paper.registry.data.dialog.action.DialogAction;
import io.papermc.paper.registry.data.dialog.type.DialogType;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Random;
import java.util.stream.Stream;
import net.kyori.adventure.key.Key;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.generator.ChunkGenerator;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

/** B780 spike (throwaway): the games extras over Paper's API (P9 to P14), driven by /<id> from the console. */
public class SpikePlugin extends JavaPlugin implements Listener {
    /** A protected box (P11). */
    record Box(String world, int x1, int y1, int z1, int x2, int y2, int z2) {
        boolean contains(Location l) {
            int x = l.getBlockX();
            int y = l.getBlockY();
            int z = l.getBlockZ();
            return l.getWorld().getName().equals(world) && x >= x1 && x <= x2 && y >= y1 && y <= y2 && z >= z1 && z <= z2;
        }
    }

    /** The holder that marks the spike's menu (P13). */
    static final class Menu implements InventoryHolder {
        Inventory inventory;

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private final List<Box> boxes = new ArrayList<>();
    private String deathMode = "off";
    private String id;

    private void say(String format, Object... args) {
        getComponentLogger().info("[msm_spike] " + id + " " + format, args);
    }

    @Override
    public void onEnable() {
        id = getPluginMeta().getName();
        say("enabled; bootstrap COMMANDS events so far {}", SpikeBootstrap.COMMAND_EVENTS.get());
        getServer().getPluginManager().registerEvents(this, this);
        getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event -> {
            say("plugin COMMANDS event cause {}", event.cause());
            event.registrar().register(admin().build(), "B780 spike checks");
            // A command registered only at enable, named by the pack's late.mcfunction (P9).
            event.registrar().register(Commands.literal(id + "_late").executes(ctx -> {
                say("late command ran ({})", SpikeCommands.describe(ctx.getSource()));
                return Command.SINGLE_SUCCESS;
            }).build());
        });
        Bukkit.getScheduler().runTask(this, () -> {
            say("first tick; enabled packs {}", Bukkit.getDatapackManager().getEnabledPacks().stream().map(p -> p.getName()).toList());
            say("all packs {}", Bukkit.getDatapackManager().getPacks().stream().map(p -> p.getName() + (p.isEnabled() ? "+" : "-")).toList());
            boolean ran = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "function " + id + ":hello");
            say("plugin ran function {}:hello -> {}; signals so far {}", id, ran, SpikeCommands.SIGNALS.get());
            bench();
        });
    }

    // ---------------------------------------------------------------- admin commands

    private LiteralArgumentBuilder<CommandSourceStack> admin() {
        return Commands.literal(id)
                .then(Commands.literal("fn").then(Commands.argument("f", StringArgumentType.greedyString()).executes(ctx -> {
                    long t = System.nanoTime();
                    boolean ok = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "function " + str(ctx, "f"));
                    say("fn {} -> {} in {} us; signals {}", str(ctx, "f"), ok, (System.nanoTime() - t) / 1000, SpikeCommands.SIGNALS.get());
                    return 1;
                })))
                .then(Commands.literal("ban").then(Commands.argument("name", StringArgumentType.word())
                        .then(Commands.argument("seconds", IntegerArgumentType.integer(1)).executes(ctx -> {
                            String name = str(ctx, "name");
                            int s = IntegerArgumentType.getInteger(ctx, "seconds");
                            Player online = Bukkit.getPlayerExact(name);
                            String reason = "Out of the game for " + s + " seconds (spike)";
                            if (online != null) {
                                var entry = online.ban(reason, Duration.ofSeconds(s), "msm_spike", true);
                                say("banned online {} until {}", name, entry == null ? null : entry.getExpiration());
                            } else {
                                var profile = Bukkit.createProfile(name);
                                var list = Bukkit.getBanList(BanListType.PROFILE);
                                var entry = list.addBan(Bukkit.getOfflinePlayer(name).getPlayerProfile(), reason, Duration.ofSeconds(s), "msm_spike");
                                say("banned offline {} ({}) until {}", name, profile.getId(), entry == null ? null : entry.getExpiration());
                            }
                            say("isBanned {} = {}", name, Bukkit.getOfflinePlayer(name).isBanned());
                            return 1;
                        }))))
                .then(Commands.literal("isbanned").then(Commands.argument("name", StringArgumentType.word()).executes(ctx -> {
                    say("isBanned {} = {}", str(ctx, "name"), Bukkit.getOfflinePlayer(str(ctx, "name")).isBanned());
                    return 1;
                })))
                .then(Commands.literal("protect")
                        .then(Commands.literal("clear").executes(ctx -> {
                            boxes.clear();
                            say("boxes cleared");
                            return 1;
                        }))
                        .then(Commands.literal("add").then(Commands.argument("box", StringArgumentType.greedyString()).executes(ctx -> {
                            String[] p = str(ctx, "box").split(" ");
                            int[] v = new int[6];
                            for (int i = 0; i < 6; i++) {
                                v[i] = Integer.parseInt(p[i]);
                            }
                            boxes.add(new Box(p.length > 6 ? p[6] : "world", Math.min(v[0], v[3]), Math.min(v[1], v[4]), Math.min(v[2], v[5]),
                                    Math.max(v[0], v[3]), Math.max(v[1], v[4]), Math.max(v[2], v[5])));
                            say("boxes {}", boxes.size());
                            return 1;
                        }))))
                .then(Commands.literal("death").then(Commands.argument("mode", StringArgumentType.word()).executes(ctx -> {
                    deathMode = str(ctx, "mode");
                    say("death mode {}", deathMode);
                    return 1;
                })))
                .then(Commands.literal("menu").then(Commands.argument("name", StringArgumentType.word()).executes(ctx -> {
                    Player p = Bukkit.getPlayerExact(str(ctx, "name"));
                    Menu holder = new Menu();
                    Inventory inv = Bukkit.createInventory(holder, 27, Component.text("Shop (spike)"));
                    holder.inventory = inv;
                    inv.setItem(11, new ItemStack(Material.IRON_SWORD));
                    inv.setItem(13, new ItemStack(Material.BREAD, 8));
                    inv.setItem(15, new ItemStack(Material.SHIELD));
                    p.openInventory(inv);
                    say("menu opened for {}", p.getName());
                    return 1;
                })))
                .then(Commands.literal("dialog").then(Commands.argument("name", StringArgumentType.word()).executes(ctx -> {
                    Player p = Bukkit.getPlayerExact(str(ctx, "name"));
                    Dialog dialog = Dialog.create(b -> b.empty()
                            .base(DialogBase.builder(Component.text("Shop (spike)")).build())
                            .type(DialogType.notice(ActionButton.builder(Component.text("Buy a sword"))
                                    .action(DialogAction.customClick(Key.key(id, "buy_sword"), null)).build())));
                    p.showDialog(dialog);
                    say("dialog shown to {}", p.getName());
                    return 1;
                })))
                .then(Commands.literal("world").then(Commands.argument("op", StringArgumentType.word())
                        .then(Commands.argument("name", StringArgumentType.greedyString()).executes(this::world))))
                .then(Commands.literal("probe")
                        .then(Commands.literal("game").executes(ctx -> {
                            var board = Bukkit.getScoreboardManager().getMainScoreboard();
                            for (String t : new String[] {"msm_sample_game_modes.arena.red", "msm_sample_game_modes.arena.blue"}) {
                                var team = board.getTeam(t);
                                say("PROBE team {} = {}", t, team == null ? "none" : team.color() + " prefix '"
                                        + PlainTextComponentSerializer.plainText().serialize(team.prefix()) + "' friendlyFire " + team.allowFriendlyFire());
                            }
                            var side = board.getObjective(org.bukkit.scoreboard.DisplaySlot.SIDEBAR);
                            say("PROBE sidebar {} criteria {} name '{}'", side == null ? null : side.getName(),
                                    side == null ? null : side.getTrackedCriteria().getName(),
                                    side == null ? null : PlainTextComponentSerializer.plainText().serialize(side.displayName()));
                            var bar = Bukkit.getBossBar(NamespacedKey.fromString("msm_sample_game_modes:msm_games/timer/arena/round"));
                            say("PROBE bossbar {}", bar == null ? "none" : "visible " + bar.isVisible() + " progress " + bar.getProgress());
                            say("PROBE advancements goals root {} first_join {}",
                                    Bukkit.getAdvancement(NamespacedKey.fromString("msm_sample_game_modes:sky_survival/goals/root")) != null,
                                    Bukkit.getAdvancement(NamespacedKey.fromString("msm_sample_game_modes:msm_games/first_join")) != null);
                            World w = Bukkit.getWorlds().getFirst();
                            say("PROBE world {} difficulty {} spawn {} {} {}", w.getKey(), w.getDifficulty(), w.getSpawnLocation().getBlockX(),
                                    w.getSpawnLocation().getBlockY(), w.getSpawnLocation().getBlockZ());
                            return 1;
                        }))
                        .then(Commands.literal("player").then(Commands.argument("name", StringArgumentType.word()).executes(ctx -> {
                            Player p = Bukkit.getPlayerExact(str(ctx, "name"));
                            if (p == null) {
                                say("PROBE player {} offline", str(ctx, "name"));
                                return 1;
                            }
                            var adv = Bukkit.getAdvancement(NamespacedKey.fromString("msm_sample_game_modes:msm_games/first_join"));
                            var team = Bukkit.getScoreboardManager().getMainScoreboard().getEntryTeam(p.getName());
                            var points = Bukkit.getScoreboardManager().getMainScoreboard().getObjective("msm_sample_game_modes.arena.points");
                            int bread = 0;
                            for (ItemStack st : p.getInventory().getContents()) {
                                if (st != null && st.getType() == Material.BREAD) {
                                    bread += st.getAmount();
                                }
                            }
                            say("PROBE player {} joined {} bread {} slowFalling {} mode {} health {} dead {} team {} points {} tags {} at {} {} {}",
                                    p.getName(), adv != null && p.getAdvancementProgress(adv).isDone(), bread,
                                    p.hasPotionEffect(org.bukkit.potion.PotionEffectType.SLOW_FALLING), p.getGameMode(), p.getHealth(), p.isDead(),
                                    team == null ? "none" : team.getName(),
                                    points == null || !points.getScore(p).isScoreSet() ? "unset" : points.getScore(p).getScore(), p.getScoreboardTags(),
                                    p.getLocation().getX(), p.getLocation().getY(), p.getLocation().getZ());
                            return 1;
                        })))
                        .then(Commands.literal("block").then(Commands.argument("pos", StringArgumentType.greedyString()).executes(ctx -> {
                            String[] v = str(ctx, "pos").split(" ");
                            Block b = Bukkit.getWorlds().getFirst().getBlockAt(Integer.parseInt(v[0]), Integer.parseInt(v[1]), Integer.parseInt(v[2]));
                            String loot = b.getState() instanceof org.bukkit.loot.Lootable l && l.getLootTable() != null
                                    ? l.getLootTable().getKey().asString() : "none";
                            say("PROBE block {} = {} loot {}", str(ctx, "pos"), b.getType().getKey(), loot);
                            return 1;
                        })))
                        .then(Commands.literal("score").then(Commands.argument("spec", StringArgumentType.greedyString()).executes(ctx -> {
                            String[] v = str(ctx, "spec").split(" ");
                            var o = Bukkit.getScoreboardManager().getMainScoreboard().getObjective(v[1]);
                            var sc = o == null ? null : o.getScore(v[0]);
                            say("PROBE score {} {} = {}", v[0], v[1], sc == null || !sc.isScoreSet() ? "unset" : sc.getScore());
                            return 1;
                        })))
                        .then(Commands.literal("tagged").then(Commands.argument("tag", StringArgumentType.word()).executes(ctx -> {
                            long n = Bukkit.getWorlds().getFirst().getEntities().stream().filter(e -> e.getScoreboardTags().contains(str(ctx, "tag"))).count();
                            say("PROBE tagged {} = {}", str(ctx, "tag"), n);
                            return 1;
                        }))))
                .then(Commands.literal("status").then(Commands.argument("name", StringArgumentType.word()).executes(ctx -> {
                    Player p = Bukkit.getPlayerExact(str(ctx, "name"));
                    if (p == null) {
                        say("status {} offline", str(ctx, "name"));
                        return 1;
                    }
                    say("status {} health {} dead {} mode {} at {} {} {} in {} items {} tags {}", p.getName(), p.getHealth(), p.isDead(),
                            p.getGameMode(), p.getLocation().getBlockX(), p.getLocation().getBlockY(), p.getLocation().getBlockZ(),
                            p.getWorld().getName(), count(p), p.getScoreboardTags());
                    return 1;
                })));
    }

    private static String str(CommandContext<CommandSourceStack> ctx, String name) {
        return StringArgumentType.getString(ctx, name);
    }

    private static int count(Player p) {
        int n = 0;
        for (ItemStack s : p.getInventory().getContents()) {
            if (s != null) {
                n += s.getAmount();
            }
        }
        return n;
    }

    // ---------------------------------------------------------------- worlds (P14)

    /** A void generator: the template is placed by the game's own place template. */
    static final class Void extends ChunkGenerator {
    }

    private int world(CommandContext<CommandSourceStack> ctx) {
        String op = str(ctx, "op");
        String name = str(ctx, "name");
        long t = System.nanoTime();
        switch (op) {
            case "make" -> {
                World w = WorldCreator.ofKey(new NamespacedKey(id, name)).generator(new Void()).generateStructures(false).createWorld();
                long made = System.nanoTime();
                w.setSpawnLocation(0, 101, 0);
                boolean placed = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "execute in " + w.getKey().asString()
                        + " run forceload add -16 -16 15 15");
                placed &= Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "execute in " + w.getKey().asString()
                        + " run place template msm_sample_game_modes:arena/arena_build -12 100 -12");
                Block floor = w.getBlockAt(-12, 100, -12);
                say("world make {} key {} path {} in {} ms; template {} in {} ms; floor {}", name, w.getKey(), w.getWorldPath(),
                        (made - t) / 1_000_000, placed, (System.nanoTime() - made) / 1_000_000, floor.getType());
            }
            case "tp" -> {
                World w = Bukkit.getWorld(new NamespacedKey(id, name));
                for (Player p : Bukkit.getOnlinePlayers()) {
                    p.teleport(new Location(w, 0.5, 101, 0.5));
                }
                say("world tp {} players {}", name, Bukkit.getOnlinePlayers().size());
            }
            case "unload" -> {
                World w = Bukkit.getWorld(new NamespacedKey(id, name));
                World main = Bukkit.getWorlds().getFirst();
                for (Player p : w.getPlayers()) {
                    p.teleport(main.getSpawnLocation());
                }
                Path path = w.getWorldPath();
                boolean ok = Bukkit.unloadWorld(w, false);
                say("world unload {} -> {} in {} ms; path {}", name, ok, (System.nanoTime() - t) / 1_000_000, path);
            }
            case "delete" -> {
                Path path = Path.of(name);
                long n = 0;
                if (Files.exists(path)) {
                    try (Stream<Path> walk = Files.walk(path)) {
                        for (Path p : walk.sorted(Comparator.reverseOrder()).toList()) {
                            Files.delete(p);
                            n++;
                        }
                    } catch (IOException e) {
                        say("world delete {} failed: {}", name, e.toString());
                    }
                }
                say("world delete {} files {} in {} ms", name, n, (System.nanoTime() - t) / 1_000_000);
            }
            case "list" -> say("worlds {}", Bukkit.getWorlds().stream().map(w -> w.getName() + "=" + w.getKey() + "@" + w.getWorldPath()).toList());
            default -> say("world: unknown op {}", op);
        }
        return 1;
    }

    // ---------------------------------------------------------------- events

    private boolean boxed(Location l) {
        for (Box b : boxes) {
            if (b.contains(l)) {
                return true;
            }
        }
        return false;
    }

    /** P11: the cost of the box check, 16 players' worth of events many times over. */
    private void bench() {
        List<Box> saved = new ArrayList<>(boxes);
        World w = Bukkit.getWorlds().getFirst();
        Random r = new Random(1);
        for (int i = 0; i < 20; i++) {
            int x = r.nextInt(2000) - 1000;
            int z = r.nextInt(2000) - 1000;
            boxes.add(new Box(w.getName(), x, 0, z, x + 30, 120, z + 30));
        }
        Location[] at = new Location[16];
        for (int i = 0; i < 16; i++) {
            at[i] = new Location(w, r.nextInt(2000) - 1000, 64, r.nextInt(2000) - 1000);
        }
        int hits = 0;
        for (int i = 0; i < 200_000; i++) {
            hits += boxed(at[i & 15]) ? 1 : 0;
        }
        long t = System.nanoTime();
        int rounds = 1_000_000;
        for (int i = 0; i < rounds; i++) {
            hits += boxed(at[i & 15]) ? 1 : 0;
        }
        long ns = System.nanoTime() - t;
        say("bench: {} checks against 20 boxes in {} ms ({} ns each; hits {})", rounds, ns / 1_000_000, ns / rounds, hits);
        boxes.clear();
        boxes.addAll(saved);
    }

    @EventHandler
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        say("pre-login {} result {}", event.getName(), event.getLoginResult());
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        say("join {} first {}", event.getPlayer().getName(), !event.getPlayer().hasPlayedBefore());
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        long t = System.nanoTime();
        if (boxed(event.getBlock().getLocation())) {
            event.setCancelled(true);
            say("break cancelled at {} by {} (check {} ns)", event.getBlock().getLocation().toVector(), event.getPlayer().getName(), System.nanoTime() - t);
        } else {
            say("break allowed {} at {} by {}", event.getBlock().getType(), event.getBlock().getLocation().toVector(), event.getPlayer().getName());
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        if (boxed(event.getBlock().getLocation())) {
            event.setCancelled(true);
            say("place cancelled at {}", event.getBlock().getLocation().toVector());
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (boxed(event.getPlayer().getLocation())) {
            event.setCancelled(true);
            say("drop cancelled for {}", event.getPlayer().getName());
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof Player p)) {
            return;
        }
        if (boxed(p.getLocation())) {
            event.setCancelled(true);
            say("damage cancelled for {} ({})", p.getName(), event.getCause());
            return;
        }
        if (deathMode.equals("damage") && event.getFinalDamage() >= p.getHealth()) {
            event.setCancelled(true);
            int dropped = 0;
            for (ItemStack s : p.getInventory().getContents()) {
                if (s != null) {
                    p.getWorld().dropItemNaturally(p.getLocation(), s);
                    dropped++;
                }
            }
            p.getInventory().clear();
            p.setHealth(p.getAttribute(org.bukkit.attribute.Attribute.MAX_HEALTH).getValue());
            p.teleport(p.getWorld().getSpawnLocation());
            say("lethal damage turned into a respawn for {}; dropped {} stacks", p.getName(), dropped);
        }
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        say("death {} mode {} drops {} keepInventory {} message {}", event.getPlayer().getName(), deathMode, event.getDrops().size(),
                event.getKeepInventory(), event.deathMessage());
        if (deathMode.equals("cancel")) {
            event.setCancelled(true);
            say("death cancelled for {}; health now {}", event.getPlayer().getName(), event.getPlayer().getHealth());
        }
    }

    @EventHandler
    public void onRespawn(PlayerRespawnEvent event) {
        say("respawn {} at {}", event.getPlayer().getName(), event.getRespawnLocation().toVector());
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (event.getInventory().getHolder(false) instanceof Menu) {
            event.setCancelled(true);
            say("menu click by {} slot {} raw {} click {} item {}", event.getWhoClicked().getName(), event.getSlot(), event.getRawSlot(),
                    event.getClick(), event.getCurrentItem() == null ? null : event.getCurrentItem().getType());
        }
    }

    @EventHandler
    public void onCustomClick(PlayerCustomClickEvent event) {
        say("custom click {} tag {}", event.getIdentifier(), event.getTag());
    }
}
