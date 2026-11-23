package dev.mcsupermods.runtime.gametest.spike619;

import com.google.gson.GsonBuilder;
import com.mojang.blaze3d.platform.NativeImage;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import javax.imageio.ImageIO;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ParticleStatus;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.DyeColor;

/**
 * B619 spike (throwaway) client GameTest (headless Mesa EGL). 3S3: for each body, every texture of the mob's folder is
 * replaced in the texture manager by MSM's own coded picture (a texel's u and v as bits over several frames, black,
 * white), the mob is shot from six sides and each screen pixel is decoded back to the texel it shows; only the decoded
 * maps (MSM's codes) and the camera numbers are written. 3S5, 3S6: armour stands with MSM's own trims on a clear
 * armour, wall banners and shields with MSM's own patterns. 3S7: widths of MSM's own fonts. 3S11: HUD and screen
 * proportions. Raw screenshots are deleted after decoding or left in the run folder (deleted after the run).
 */
public class B619ClientGameTest implements FabricClientGameTest {
    static final Path OUT = Path.of("/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b619/run");
    static final int S = 1200;
    static final Map<String, Object> R = new TreeMap<>();

    record Body(String name, String type, String nbt, List<String> code, List<String> clear) {}

    static final List<String> VILL = List.of("villager/villager.png", "villager/villager_baby.png", "villager/type/",
            "villager/baby/", "villager/profession/", "villager/profession_level/");

    static Body vill(String name, String nbt, String... code) {
        List<String> c = List.of(code);
        List<String> clear = new ArrayList<>();
        for (String v : VILL) {
            if (!c.contains(v)) {
                clear.add(v);
            }
        }
        return new Body(name, "villager", nbt, c, clear);
    }

    static final String BABY = ",Age:-24000";
    static final String VD = "VillagerData:{type:\"minecraft:plains\",profession:\"minecraft:farmer\",level:2}";

    static final List<Body> BODIES = List.of(
            new Body("wolf", "wolf", "variant:\"minecraft:pale\"", List.of("wolf/"), List.of()),
            new Body("wolf_baby", "wolf", "variant:\"minecraft:pale\"" + BABY, List.of("wolf/"), List.of()),
            new Body("cat", "cat", "variant:\"minecraft:tabby\"", List.of("cat/"), List.of("cat/cat_collar")),
            new Body("cat_baby", "cat", "variant:\"minecraft:tabby\"" + BABY, List.of("cat/"), List.of("cat/cat_collar")),
            new Body("pig", "pig", "variant:\"minecraft:temperate\"", List.of("pig/"), List.of()),
            new Body("pig_cold", "pig", "variant:\"minecraft:cold\"", List.of("pig/"), List.of()),
            new Body("pig_baby", "pig", "variant:\"minecraft:temperate\"" + BABY, List.of("pig/"), List.of()),
            new Body("pig_cold_baby", "pig", "variant:\"minecraft:cold\"" + BABY, List.of("pig/"), List.of()),
            new Body("cow", "cow", "variant:\"minecraft:temperate\"", List.of("cow/"), List.of()),
            new Body("cow_cold", "cow", "variant:\"minecraft:cold\"", List.of("cow/"), List.of()),
            new Body("cow_warm", "cow", "variant:\"minecraft:warm\"", List.of("cow/"), List.of()),
            new Body("cow_baby", "cow", "variant:\"minecraft:temperate\"" + BABY, List.of("cow/"), List.of()),
            new Body("chicken", "chicken", "variant:\"minecraft:temperate\"", List.of("chicken/"), List.of()),
            new Body("chicken_cold", "chicken", "variant:\"minecraft:cold\"", List.of("chicken/"), List.of()),
            new Body("chicken_baby", "chicken", "variant:\"minecraft:temperate\"" + BABY, List.of("chicken/"), List.of()),
            new Body("frog", "frog", "variant:\"minecraft:temperate\"", List.of("frog/"), List.of()),
            new Body("zombie_nautilus", "zombie_nautilus", "variant:\"minecraft:temperate\"", List.of("nautilus/zombie_nautilus"), List.of()),
            new Body("zombie_nautilus_warm", "zombie_nautilus", "variant:\"minecraft:warm\"", List.of("nautilus/zombie_nautilus"), List.of()),
            vill("villager", VD, "villager/villager.png"),
            vill("villager_type", VD, "villager/type/"),
            vill("villager_profession", VD, "villager/profession/"),
            vill("villager_level", VD, "villager/profession_level/"),
            vill("villager_baby", VD + BABY, "villager/villager_baby.png"),
            vill("villager_baby_type", VD + BABY, "villager/baby/"),
            new Body("sulfur_cube_outer", "sulfur_cube", "Size:2", List.of("sulfur_cube/sulfur_cube_outer"), List.of("sulfur_cube/sulfur_cube_inner")),
            new Body("sulfur_cube_inner", "sulfur_cube", "Size:2", List.of("sulfur_cube/sulfur_cube_inner"), List.of("sulfur_cube/sulfur_cube_outer")),
            new Body("sulfur_cube_small_outer", "sulfur_cube", "Size:0", List.of("sulfur_cube/sulfur_cube_outer"), List.of("sulfur_cube/sulfur_cube_inner")),
            new Body("sulfur_cube_small_inner", "sulfur_cube", "Size:0", List.of("sulfur_cube/sulfur_cube_inner"), List.of("sulfur_cube/sulfur_cube_outer")));

    static String mc() {
        return FabricLoader.getInstance().getModContainer("minecraft").orElseThrow().getMetadata().getVersion().getFriendlyString();
    }

    static Path out() {
        return OUT.resolve(mc());
    }

    static synchronized void put(String k, Object v) {
        R.put(k, v);
        String s = String.valueOf(v);
        System.out.println("[b619] " + k + " = " + (s.length() > 300 ? s.substring(0, 300) + "..." : s));
        try {
            Files.createDirectories(out());
            Files.writeString(out().resolve(Files.exists(OUT.resolve("only.txt")) ? "client-rerun.json" : "client.json"), new GsonBuilder().setPrettyPrinting().disableHtmlEscaping()
                    .create().toJson(R), StandardCharsets.UTF_8);
        } catch (Throwable e) {
            System.out.println("[b619] write failed " + e);
        }
    }

    interface Step {
        void run() throws Throwable;
    }

    static void section(String name, Step s) {
        long t = System.nanoTime();
        try {
            s.run();
        } catch (Throwable e) {
            put(name + ".error", e.toString());
            e.printStackTrace(System.out);
        }
        put(name + ".ms", (System.nanoTime() - t) / 1_000_000);
    }

    // ---- coded textures ----

    static final class Coded {
        final List<Identifier> tex = new ArrayList<>();
        final Map<Identifier, int[]> size = new LinkedHashMap<>();
        final Map<Identifier, Boolean> coded = new LinkedHashMap<>();
        int ubits, vbits;
    }

    static int bits(int n) {
        int b = 0;
        while ((1 << b) < n) {
            b++;
        }
        return b;
    }

    static boolean matches(String path, List<String> prefixes) {
        for (String p : prefixes) {
            if (path.startsWith("textures/entity/" + p)) {
                return true;
            }
        }
        return false;
    }

    static Coded prepare(Minecraft mc, Body b, Map<Identifier, Object> registered) throws Exception {
        Coded c = new Coded();
        List<String> roots = new ArrayList<>();
        for (String p : b.code()) {
            roots.add(p.substring(0, p.indexOf('/')));
        }
        for (String p : b.clear()) {
            roots.add(p.substring(0, p.indexOf('/')));
        }
        int maxW = 1, maxH = 1;
        for (String root : roots.stream().distinct().toList()) {
            var found = mc.getResourceManager().listResources("textures/entity/" + root,
                    id -> id.getNamespace().equals("minecraft") && id.getPath().endsWith(".png"));
            for (var e : new TreeMap<>(found).entrySet()) {
                String path = e.getKey().getPath();
                boolean clear = matches(path, b.clear());
                boolean code = !clear && matches(path, b.code());
                if (!clear && !code) {
                    continue;
                }
                int w, h;
                try (InputStream in = e.getValue().open(); NativeImage img = NativeImage.read(in)) {
                    w = img.getWidth();
                    h = img.getHeight();
                }
                c.size.put(e.getKey(), new int[] {w, h});
                c.coded.put(e.getKey(), code);
                if (code) {
                    maxW = Math.max(maxW, w);
                    maxH = Math.max(maxH, h);
                }
                c.tex.add(e.getKey());
            }
        }
        c.ubits = bits(maxW);
        c.vbits = bits(maxH);
        return c;
    }

    /** Registers a fresh texture under the id: DynamicTexture on 26.3, TextureResources.from2dImage on 26.4. */
    static void install(Minecraft mc, Identifier id, NativeImage img) throws Exception {
        java.util.function.Supplier<String> label = () -> "b619 " + id;
        Object tex;
        try {
            Class<?> dt = Class.forName("net.minecraft.client.renderer.texture.DynamicTexture");
            tex = dt.getConstructor(java.util.function.Supplier.class, NativeImage.class).newInstance(label, img);
        } catch (ClassNotFoundException e) {
            Class<?> tr = Class.forName("net.minecraft.client.renderer.texture.TextureResources");
            tex = tr.getMethod("from2dImage", java.util.function.Supplier.class, NativeImage.class).invoke(null, label, img);
        }
        Object tm = mc.getTextureManager();
        for (var m : tm.getClass().getMethods()) {
            if (m.getName().equals("register") && m.getParameterCount() == 2 && m.getParameterTypes()[1].isInstance(tex)) {
                m.invoke(tm, id, tex);
                return;
            }
        }
        throw new IllegalStateException("no register for " + tex.getClass());
    }

    /** plane -2 black, -1 white, else bit plane p (channels R, G, B = bits 3p, 3p+1, 3p+2 of u | v << ubits). */
    static void fill(Minecraft mc, Coded c, int plane) throws Exception {
        for (Identifier id : c.tex) {
            boolean code = c.coded.get(id);
            int w = c.size.get(id)[0], h = c.size.get(id)[1];
            NativeImage img = new NativeImage(w, h, false);
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int argb;
                    if (!code) {
                        argb = 0;
                    } else if (plane == -2) {
                        argb = 0xFF000000;
                    } else if (plane == -1) {
                        argb = 0xFFFFFFFF;
                    } else {
                        int v = x | (y << c.ubits);
                        int r = ((v >> (3 * plane)) & 1) * 255;
                        int g = ((v >> (3 * plane + 1)) & 1) * 255;
                        int bl = ((v >> (3 * plane + 2)) & 1) * 255;
                        argb = 0xFF000000 | (r << 16) | (g << 8) | bl;
                    }
                    img.setPixel(x, y, argb);
                }
            }
            install(mc, id, img);
        }
    }

    static int[] shot(ClientGameTestContext ctx, String name, int w, int h) throws Exception {
        Path p = ctx.takeScreenshot(TestScreenshotOptions.of(name).withSize(w, h).disableCounterPrefix());
        BufferedImage img = ImageIO.read(p.toFile());
        int[] px = img.getRGB(0, 0, img.getWidth(), img.getHeight(), null, 0, img.getWidth());
        Files.deleteIfExists(p);
        return px;
    }

    static Entity find(Minecraft mc, String type) {
        for (Entity e : mc.level.entitiesForRendering()) {
            if (net.minecraft.world.entity.EntityType.getKey(e.getType()).getPath().equals(type)) {
                return e;
            }
        }
        return null;
    }

    static String variantOf(Entity e) {
        List<String> out = new ArrayList<>();
        for (var f : DataComponents.class.getFields()) {
            if (!f.getName().endsWith("_VARIANT")) {
                continue;
            }
            try {
                Object v = e.get((net.minecraft.core.component.DataComponentType<?>) f.get(null));
                if (v != null) {
                    out.add(f.getName() + "=" + v);
                }
            } catch (Throwable ignored) {
                // not an entity component
            }
        }
        return String.join(";", out);
    }

    static final double[][] VIEWS = {
        // name index: dx, dy, dz, yaw, pitch
        {0, 0, 1, 180, 0}, {0, 0, -1, 0, 0}, {1, 0, 0, 90, 0}, {-1, 0, 0, -90, 0}, {0, 1, 0, 180, 90}, {0, -1, 0, 180, -90},
        {0, 0, 1, 180, 0}};
    static final String[] VIEW_NAMES = {"front", "back", "east", "west", "top", "bottom", "front2"};

    static void bodies(ClientGameTestContext ctx, TestServerContext server) throws Exception {
        Map<Identifier, Object> registered = new LinkedHashMap<>();
        server.runCommand("setblock 0 150 0 minecraft:barrier");
        List<String> only = Files.exists(OUT.resolve("only.txt"))
                ? Files.readAllLines(OUT.resolve("only.txt")).stream().map(String::trim).filter(x -> !x.isEmpty()).toList() : List.of();
        for (Body b : BODIES) {
            if (!only.isEmpty() && !only.contains(b.name())) {
                continue;
            }
            section("body." + b.name(), () -> body(ctx, server, b, registered));
        }
    }

    static void body(ClientGameTestContext ctx, TestServerContext server, Body b, Map<Identifier, Object> reg)
            throws Exception {
        Coded c = ctx.computeOnClient(mc -> prepare(mc, b, reg));
        int planes = (c.ubits + c.vbits + 2) / 3;
        Map<String, Object> meta = new LinkedHashMap<>();
        Map<String, Object> textures = new LinkedHashMap<>();
        c.size.forEach((k, v) -> textures.put(k.getPath(), v[0] + "x" + v[1] + (c.coded.get(k) ? " coded" : " clear")));
        meta.put("textures", textures);
        meta.put("ubits", c.ubits);
        meta.put("vbits", c.vbits);
        ctx.runOnClient(mc -> fill(mc, c, -1));
        server.runCommand("kill @e[type=!player]");
        ctx.waitTicks(2);
        server.runCommand("summon minecraft:" + b.type() + " 0.5 151.3 0.5 {NoAI:1b,Silent:1b,Invulnerable:1b,"
                + "PersistenceRequired:1b,Rotation:[0f,0f]," + b.nbt() + "}");
        ctx.waitFor(mc -> find(mc, b.type()) != null, 100);
        java.util.regex.Matcher vm0 = java.util.regex.Pattern.compile("variant:\\\"([a-z_:]+)\\\"").matcher(b.nbt());
        if (vm0.find()) {
            String vreg = b.type().toUpperCase(java.util.Locale.ROOT) + "_VARIANT";
            String vid = vm0.group(1);
            server.runOnServer(s -> setVariant(s, vreg, vid));
        }
        ctx.waitTicks(60);
        double[] bb = ctx.computeOnClient(mc -> {
            Entity e = find(mc, b.type());
            return new double[] {e.getX(), e.getY(), e.getZ(), e.getBbWidth(), e.getBbHeight(), e.getYRot()};
        });
        meta.put("entity", bb);
        meta.put("variant", ctx.computeOnClient(mc -> variantOf(find(mc, b.type()))));
        double size = Math.max(bb[3], bb[4]);
        double dist = Math.max(1.5, 6 * size);
        double cx = bb[0], cy = bb[1] + bb[4] / 2, cz = bb[2];
        meta.put("distance", dist);
        meta.put("centre", new double[] {cx, cy, cz});
        List<Object> views = new ArrayList<>();
        for (int vi = 0; vi < VIEWS.length; vi++) {
            double[] v = VIEWS[vi];
            double ex = cx + v[0] * dist, ey = cy + v[1] * dist, ez = cz + v[2] * dist;
            server.runCommand(String.format(java.util.Locale.ROOT, "tp @p %.5f %.5f %.5f %.1f %.1f", ex, ey - 1.62, ez, v[3], v[4]));
            ctx.waitTicks(4);
            Map<String, Object> vm = new LinkedHashMap<>();
            vm.put("view", VIEW_NAMES[vi]);
            vm.put("camera", ctx.computeOnClient(mc -> {
                var cam = mc.gameRenderer.mainCamera();
                return new double[] {cam.position().x, cam.position().y, cam.position().z, cam.yRot(), cam.xRot()};
            }));
            long t0 = System.nanoTime();
            ctx.runOnClient(mc -> fill(mc, c, -2));
            ctx.waitTick();
            int[] black = shot(ctx, "b619_" + b.name() + "_black", S, S);
            ctx.runOnClient(mc -> fill(mc, c, -1));
            ctx.waitTick();
            int[] white = shot(ctx, "b619_" + b.name() + "_white", S, S);
            int[][] pl = new int[planes][];
            for (int p = 0; p < planes; p++) {
                final int pp = p;
                ctx.runOnClient(mc -> fill(mc, c, pp));
                ctx.waitTick();
                pl[p] = shot(ctx, "b619_" + b.name() + "_p" + p, S, S);
            }
            ctx.runOnClient(mc -> fill(mc, c, -1));
            ctx.waitTick();
            int[] white2 = shot(ctx, "b619_" + b.name() + "_white2", S, S);
            vm.put("shotsMs", (System.nanoTime() - t0) / 1_000_000);
            // decode
            BufferedImage dec = new BufferedImage(S, S, BufferedImage.TYPE_INT_RGB);
            int fg = 0, unstable = 0, weak = 0;
            int umask = (1 << c.ubits) - 1;
            for (int i = 0; i < S * S; i++) {
                int[] bk = rgb(black[i]), wh = rgb(white[i]), w2 = rgb(white2[i]);
                int range = (wh[0] - bk[0]) + (wh[1] - bk[1]) + (wh[2] - bk[2]);
                if (range < 90) {
                    continue;
                }
                fg++;
                int code = 0;
                boolean wk = false;
                for (int p = 0; p < planes; p++) {
                    int[] q = rgb(pl[p][i]);
                    for (int ch = 0; ch < 3; ch++) {
                        int r = wh[ch] - bk[ch];
                        if (r < 20) {
                            wk = true;
                            continue;
                        }
                        int d = q[ch] - bk[ch];
                        if (Math.abs(2 * d - r) < r / 3) {
                            wk = true;
                        }
                        if (2 * d > r) {
                            code |= 1 << (3 * p + ch);
                        }
                    }
                }
                boolean un = Math.abs(w2[0] - wh[0]) > 24 || Math.abs(w2[1] - wh[1]) > 24 || Math.abs(w2[2] - wh[2]) > 24;
                if (un) {
                    unstable++;
                }
                if (wk) {
                    weak++;
                }
                int u = code & umask, vv = code >> c.ubits;
                dec.setRGB(i % S, i / S, (u << 16) | (vv << 8) | (un ? 128 : wk ? 64 : 255));
            }
            Path dp = out().resolve("bodies").resolve(b.name() + "_" + VIEW_NAMES[vi] + ".png");
            Files.createDirectories(dp.getParent());
            ImageIO.write(dec, "png", dp.toFile());
            vm.put("foreground", fg);
            vm.put("unstable", unstable);
            vm.put("weak", weak);
            views.add(vm);
        }
        meta.put("views", views);
        server.runCommand("kill @e[type=!player]");
        ctx.runOnClient(mc -> fill(mc, c, -1));
        put("body." + b.name(), meta);
        System.gc();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    static void setVariant(net.minecraft.server.MinecraftServer s, String reg, String id) throws Exception {
        var rk = (net.minecraft.resources.ResourceKey) net.minecraft.core.registries.Registries.class.getField(reg).get(null);
        var holder = s.registryAccess().lookupOrThrow(rk).getOrThrow(net.minecraft.resources.ResourceKey.create(rk, Identifier.parse(id)));
        var ct = (net.minecraft.core.component.DataComponentType) DataComponents.class.getField(reg).get(null);
        for (var level : s.getAllLevels()) {
            for (Entity e : level.getAllEntities()) {
                if (!(e instanceof net.minecraft.world.entity.player.Player)) {
                    e.setComponent(ct, holder);
                }
            }
        }
    }

    static int[] rgb(int argb) {
        return new int[] {(argb >> 16) & 255, (argb >> 8) & 255, argb & 255};
    }

    // ---- 3S5 trims, 3S6 banners and shields ----

    static final String[][] TRIMS = {{"k0", "msm_b619:m"}, {"k1", "msm_b619:m"}, {"k2", "msm_b619:m"}, {"k3", "msm_b619:m"},
        {"k4", "msm_b619:m"}, {"k5", "msm_b619:m"}, {"k6", "msm_b619:m"}, {"k7", "msm_b619:m"}, {"xred", "msm_b619:m"},
        {"xgrey", "msm_b619:m"}, {"khalf", "msm_b619:m"}, {"knometa", "msm_b619:m"}, {"k3", "minecraft:gold"}};

    static void goTo(ClientGameTestContext ctx, TestServerContext server, String pos) {
        server.runCommand("tp @p " + pos);
        ctx.waitTicks(40);
    }

    static void looks(ClientGameTestContext ctx, TestServerContext server) throws Exception {
        server.runCommand("kill @e[type=!player]");
        goTo(ctx, server, "103.5 150 14 180 0");
        for (int i = 0; i < TRIMS.length; i++) {
            int col = i % 7, row = i / 7;
            server.runCommand(String.format(java.util.Locale.ROOT,
                    "summon minecraft:armor_stand %d.5 %d 0.5 {Invisible:1b,NoGravity:1b,Rotation:[0f,0f],equipment:{chest:"
                            + "{id:\"minecraft:iron_chestplate\",count:1,components:{\"minecraft:equippable\":{slot:\"chest\","
                            + "asset_id:\"msm_b619:clear\"},\"minecraft:trim\":{pattern:\"msm_b619:%s\",material:\"%s\"}}}}}",
                    100 + col, 150 - row * 3, TRIMS[i][0], TRIMS[i][1]));
        }
        server.runCommand("summon minecraft:armor_stand 106.5 147 0.5 {Invisible:1b,NoGravity:1b,Rotation:[0f,0f],"
                + "equipment:{chest:{id:\"minecraft:iron_chestplate\",count:1,components:{\"minecraft:equippable\":{slot:"
                + "\"chest\",asset_id:\"msm_b619:clear\"}}}}}");
        ctx.waitTicks(20);
        server.runCommand("tp @p 103.5 148.2 14.5 180 0");
        ctx.waitTicks(10);
        Path p = ctx.takeScreenshot(TestScreenshotOptions.of("b619_trims").withSize(S, S).disableCounterPrefix());
        put("trims.screenshot", p.toString());
        List<String> order = new ArrayList<>();
        for (String[] t : TRIMS) {
            order.add(t[0] + "/" + t[1]);
        }
        put("trims.layout", "stands at x=100.5+col, y=150-3*row (feet), z=0.5, col=i%7, row=i/7, order " + String.join(",", order)
                + "; stand at 106.5,147 has no trim; camera 103.5 149.82 14.5 yaw 180, fov 30, " + S + "x" + S);
        // banners: wall banners on a stone wall at z = -1, facing south.
        goTo(ctx, server, "205.5 150 14 180 0");
        List<String[]> banners = new ArrayList<>();
        for (DyeColor d : DyeColor.values()) {
            banners.add(new String[] {"white", "[{pattern:\"msm_b619:full\",color:\"" + d.getSerializedName() + "\"}]", "full_" + d.getSerializedName()});
        }
        banners.add(new String[] {"white", "[]", "base_white"});
        banners.add(new String[] {"red", "[]", "base_red"});
        banners.add(new String[] {"white", "[{pattern:\"msm_b619:grey\",color:\"white\"}]", "grey_white"});
        banners.add(new String[] {"white", "[{pattern:\"msm_b619:grey\",color:\"yellow\"}]", "grey_yellow"});
        banners.add(new String[] {"white", "[{pattern:\"msm_b619:full\",color:\"blue\"},{pattern:\"msm_b619:halfa\",color:\"lime\"}]", "blue_then_halfa_lime"});
        banners.add(new String[] {"white", "[{pattern:\"msm_b619:full\",color:\"blue\"},{pattern:\"msm_b619:full\",color:\"yellow\"}]", "blue_then_yellow"});
        banners.add(new String[] {"red", "[{pattern:\"msm_b619:halfa\",color:\"white\"}]", "red_halfa_white"});
        Map<String, Object> layout = new LinkedHashMap<>();
        for (int i = 0; i < banners.size(); i++) {
            int col = i % 12, row = i / 12;
            String[] bn = banners.get(i);
            int x = 200 + col, y = 152 - row * 3;
            server.runCommand(String.format(java.util.Locale.ROOT, "fill %d %d -1 %d %d -1 minecraft:stone", x, y - 2, x, y));
            server.runCommand(String.format(java.util.Locale.ROOT, "setblock %d %d 0 minecraft:%s_wall_banner[facing=south]{patterns:%s}",
                    x, y, bn[0], bn[1]));
            layout.put(bn[2], new int[] {x, y, 0});
        }
        String[][] shields = {
            {"white", "[{pattern:\"msm_b619:full\",color:\"blue\"}]", "shield_full_blue"},
            {"red", "[]", "shield_base_red"},
            {"white", "[{pattern:\"msm_b619:grey\",color:\"yellow\"}]", "shield_grey_yellow"},
            {"white", "[{pattern:\"msm_b619:full\",color:\"white\"}]", "shield_full_white"},
            {"", "[]", "shield_plain"}};
        for (int i = 0; i < shields.length; i++) {
            int x = 200 + i * 2;
            server.runCommand(String.format(java.util.Locale.ROOT, "setblock %d 145 -1 minecraft:stone", x));
            String comps = shields[i][0].isEmpty() ? "{}" : "{\"minecraft:base_color\":\"" + shields[i][0]
                    + "\",\"minecraft:banner_patterns\":" + shields[i][1] + "}";
            server.runCommand(String.format(java.util.Locale.ROOT,
                    "summon minecraft:item_frame %d 145 0 {Facing:3b,Invisible:1b,Fixed:1b,Item:{id:\"minecraft:shield\",count:1,components:%s}}",
                    x, comps));
            layout.put(shields[i][2], new int[] {x, 145, 0});
        }
        put("banners.layout", layout);
        Map<String, Object> dyes = new LinkedHashMap<>();
        for (DyeColor d : DyeColor.values()) {
            try {
                int c = (int) DyeColor.class.getMethod("getTextureDiffuseColor").invoke(d);
                dyes.put(d.getSerializedName(), String.format("#%06X", c & 0xFFFFFF));
            } catch (ReflectiveOperationException e) {
                dyes.put(d.getSerializedName(), "no accessor");
            }
        }
        put("dyes.textureDiffuseColor", dyes);
        ctx.waitTicks(20);
        server.runCommand("tp @p 206.0 148.88 17 180 0");
        ctx.waitTicks(10);
        Path bp = ctx.takeScreenshot(TestScreenshotOptions.of("b619_banners").withSize(1600, 1200).disableCounterPrefix());
        put("banners.screenshot", bp.toString() + " camera 206.0 150.5 17 yaw 180 fov 30 1600x1200");
        server.runCommand("tp @p 204.5 144.0 5 180 0");
        ctx.waitTicks(10);
        Path sp = ctx.takeScreenshot(TestScreenshotOptions.of("b619_shields").withSize(1600, 1200).disableCounterPrefix());
        put("shields.screenshot", sp.toString() + " camera 204.5 145.62 5 yaw 180 fov 30 1600x1200");
    }

    // ---- 3S7 fonts ----

    static void fonts(ClientGameTestContext ctx) {
        Map<String, Object> m = ctx.computeOnClient(mc -> {
            Map<String, Object> r = new LinkedHashMap<>();
            String[] fonts = {"msm_b619:bitmap8", "msm_b619:bitmap16", "msm_b619:bitmap4", "msm_b619:space", "msm_b619:ref",
                "msm_b619:ttf11", "minecraft:default", "minecraft:uniform", "minecraft:alt"};
            String[] texts = {"A", "B", "C", "D", "E", "F", "G", "H", "AB", "ABCDEFGH", " ", "a", "b", "  ", "Z", "Hello",
                "中", "é", "AAAA"};
            for (String f : fonts) {
                Map<String, Integer> w = new LinkedHashMap<>();
                for (String t : texts) {
                    Component c = Component.literal(t).setStyle(Style.EMPTY.withFont(
                            new FontDescription.Resource(Identifier.parse(f))));
                    w.put(t, mc.font.width(c));
                }
                r.put(f, w);
            }
            r.put("lineHeight", mc.font.lineHeight);
            return r;
        });
        put("fonts.widths", m);
    }

    // ---- 3S11 HUD and screens ----

    static void hud(ClientGameTestContext ctx, TestServerContext server) throws Exception {
        server.runCommand("kill @e[type=!player]");
        server.runCommand("gamemode survival @a");
        ctx.runOnClient(mc -> {
            if (mc.gui.hud.isHidden()) {
                mc.gui.hud.toggle();
            }
        });
        server.runCommand("gamerule fall_damage false");
        goTo(ctx, server, "300.5 151 0.5 180 0");
        server.runCommand("setblock 300 150 0 minecraft:barrier");
        server.runCommand("tp @p 300.5 151 0.5 180 0");
        ctx.waitTicks(10);
        Map<String, Object> wp = new LinkedHashMap<>();
        int[] dists = {3, 6, 8, 10, 14, 18, 22, 26, 30, 32, 40, 70};
        for (int d : dists) {
            server.runCommand("kill @e[type=armor_stand]");
            server.runCommand(String.format(java.util.Locale.ROOT, "summon minecraft:armor_stand 300.5 151 %d.5 {NoGravity:1b,Invisible:1b,"
                    + "Tags:[\"b619wp\"],attributes:[{id:\"minecraft:waypoint_transmit_range\",base:1000}]}", -d));
            ctx.waitTicks(5);
            server.runCommand("waypoint modify @e[tag=b619wp,limit=1] style set msm_b619:test");
            server.runCommand("waypoint modify @e[tag=b619wp,limit=1] color white");
            ctx.waitTicks(10);
            Path p = ctx.takeScreenshot(TestScreenshotOptions.of("b619_waypoint_" + d).disableCounterPrefix());
            wp.put(String.valueOf(d), p.toString());
        }
        put("hud.waypoint", wp);
        server.runCommand("kill @e[type=armor_stand]");
        server.runCommand("effect give @p minecraft:speed 1000 0");
        server.runCommand("effect give @p msm_test:chiming 1000 0");
        ctx.waitTicks(10);
        put("hud.effects", ctx.takeScreenshot(TestScreenshotOptions.of("b619_effects_hud").disableCounterPrefix()).toString());
        ctx.getInput().pressKey(o -> o.keyInventory);
        ctx.waitTicks(10);
        put("hud.inventory", ctx.takeScreenshot(TestScreenshotOptions.of("b619_effects_inventory").disableCounterPrefix()).toString());
        put("hud.inventory.screen", screen(ctx));
        ctx.setScreen(() -> null);
        server.runCommand("gamemode creative @a");
        ctx.waitTicks(10);
        ctx.getInput().pressKey(o -> o.keyInventory);
        ctx.waitTicks(10);
        put("hud.creative", ctx.takeScreenshot(TestScreenshotOptions.of("b619_creative").disableCounterPrefix()).toString());
        put("hud.creative.screen", screen(ctx));
        ctx.setScreen(() -> null);
    }

    static Map<String, Object> screen(ClientGameTestContext ctx) {
        return ctx.computeOnClient(mc -> {
            Map<String, Object> m = new LinkedHashMap<>();
            var s = mc.gui.screen();
            m.put("class", s == null ? "none" : s.getClass().getSimpleName());
            m.put("size", mc.getWindow().getGuiScaledWidth() + "x" + mc.getWindow().getGuiScaledHeight()
                    + " scale " + mc.getWindow().getGuiScale());
            if (s instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?> a) {
                List<String> slots = new ArrayList<>();
                for (Slot sl : a.getMenu().slots) {
                    slots.add(sl.x + "," + sl.y);
                }
                m.put("slots", slots);
            }
            return m;
        });
    }

    static boolean onlyWithoutLooks() {
        try {
            return Files.exists(OUT.resolve("only.txt")) && !Files.readAllLines(OUT.resolve("only.txt")).contains("looks");
        } catch (java.io.IOException e) {
            return false;
        }
    }

    @Override
    public void runTest(ClientGameTestContext ctx) {
        ctx.runOnClient(mc -> {
            mc.options.fov().set(30);
            mc.options.fovEffectScale().set(0.0);
            mc.options.entityDistanceScaling().set(5.0);
            mc.options.entityShadows().set(false);
            mc.options.bobView().set(false);
            mc.options.cloudStatus().set(CloudStatus.OFF);
            mc.options.particles().set(ParticleStatus.MINIMAL);
            if (!mc.gui.hud.isHidden()) {
                mc.gui.hud.toggle();
            }
        });
        try (TestSingleplayerContext world = ctx.worldBuilder().create()) {
            TestServerContext server = world.getServer();
            for (String cmd : List.of("gamerule advance_time false", "gamerule advance_weather false", "gamerule spawn_mobs false",
                    "gamerule send_command_feedback false", "time set 6000", "weather clear", "gamemode spectator @a")) {
                server.runCommand(cmd);
            }
            world.getConnection().waitForChunksRender();
            put("mc", mc());
            section("calibration", () -> {
                server.runCommand("tp @p 0.5 148.38 6.0 180 0");
                ctx.waitTicks(5);
                int[] without = shot(ctx, "b619_cal0", S, S);
                server.runCommand("setblock 0 149 0 minecraft:white_concrete");
                ctx.waitTicks(5);
                int[] with = shot(ctx, "b619_cal1", S, S);
                server.runCommand("setblock 0 149 0 minecraft:air");
                int minX = S, maxX = -1, minY = S, maxY = -1;
                for (int i = 0; i < S * S; i++) {
                    int[] a = rgb(without[i]), b2 = rgb(with[i]);
                    if (Math.abs(a[0] - b2[0]) + Math.abs(a[1] - b2[1]) + Math.abs(a[2] - b2[2]) > 30) {
                        minX = Math.min(minX, i % S);
                        maxX = Math.max(maxX, i % S);
                        minY = Math.min(minY, i / S);
                        maxY = Math.max(maxY, i / S);
                    }
                }
                put("calibration.block", Map.of("box", new int[] {minX, minY, maxX, maxY}, "note",
                        "block 0..1,149..150,0..1, eye 0.5 150.0 6.0 yaw 180 pitch 0; front face at z=1, distance 5"));
                put("calibration.camera", ctx.computeOnClient(mc -> {
                    var cam = mc.gameRenderer.mainCamera();
                    return new double[] {cam.position().x, cam.position().y, cam.position().z, cam.yRot(), cam.xRot()};
                }));
            });
            section("bodies", () -> bodies(ctx, server));
            if (onlyWithoutLooks()) {
                return;
            }
            section("looks", () -> looks(ctx, server));
            section("fonts", () -> fonts(ctx));
            section("hud", () -> hud(ctx, server));
        }
    }
}
