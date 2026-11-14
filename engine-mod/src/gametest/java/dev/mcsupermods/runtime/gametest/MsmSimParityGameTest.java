package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.BasePressurePlateBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The shared Try it scenarios played in the real server (ADR 0085 D10, B397): {@code fixtures/sim-parity/scenarios.json}
 * over the fixture project's content ({@code fixtures/sim-parity/mod/<target id>/}, loaded as an extra mod through
 * {@code fabric.addMods} by {@code build.gradle.kts}). {@code @msm/sim} plays the same file in Vitest (B399), so the
 * expectations are what this runtime does, and the simulation must agree.
 *
 * <p>One GameTest per scenario, named after it ({@code stairs_outer_corner} is {@link #stairsOuterCorner});
 * {@link #everyScenarioHasAGameTest} keeps the two lists equal. Each scenario plays in its own 8 by 8 by 8 test area
 * on a stone floor: scenario position {@code (x, y, z)} is the area's {@code (x, y + 1, z)}, so the floor is the
 * scenario's {@code y = -1}, as Try it's floor. A creative mock player (no drops, no used-up stacks, as Try it) stands
 * parked above the area and is moved only to step on a block. Clean room: the test drives the game as a player
 * would and reads only the states, shapes and runtime events it can observe.
 *
 * <ul>
 *   <li>{@code place}: the player holds the block's item, looks at {@code yaw} and {@code pitch} (yaw 0 looks south,
 *       90 west; negative pitch is up) and right-clicks {@code face} of the block at {@code pos} at {@code hit}
 *       (block units from that block's corner), through {@code ServerPlayerGameMode.useItemOn} as the network
 *       handler does.</li>
 *   <li>{@code use}: the same with an empty hand, looking at {@code yaw}, on the top face (or {@code face}).</li>
 *   <li>{@code step_on}: the player stands on the block for one moment and leaves it: a pressure plate gets the player
 *       through {@code entityInside} (standing in it), any other block {@code stepOn} (standing on top), as the
 *       player's movement would hand them over; then the player is parked again.</li>
 *   <li>{@code wait}: {@code ticks} game ticks pass.</li>
 *   <li>{@code break}: the player breaks the block ({@code ServerPlayerGameMode.destroyBlock}).</li>
 * </ul>
 *
 * <p>Any step may carry {@code expect}: {@code blocks} (a state string; only the properties it lists are compared,
 * {@code minecraft:air} is any air) and {@code shapes} (the bounds of the outline and collision shapes in pixels,
 * {@code null} for none), checked right after the step. Every scenario has {@code events} (each event the runtime
 * ran for a {@code sim_parity} block in the area: owner, event, depth, position) and {@code actions} (each action
 * with its event), in order, compared at the end.
 *
 * <p>With {@code -PupdateSimParity} ({@code msm.sim.parity.update}) nothing is compared: each scenario writes the
 * values it saw back into the file, keeping the positions and the property names listed.
 */
public class MsmSimParityGameTest {
    private static final String NS = "sim_parity";
    private static final int MAX_TICKS = 200;
    /** The scenario's area: the 8 by 8 by 8 empty structure. */
    private static final int AREA = 8;
    private static final double EPS = 1e-6;

    private static JsonObject document;

    // Scenarios (one per entry of scenarios.json, in its order)

    @GameTest(maxTicks = MAX_TICKS)
    public void pillarAxisFromFace(GameTestHelper helper) {
        play(helper, "pillar_axis_from_face");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void horizontalFacesThePlayer(GameTestHelper helper) {
        play(helper, "horizontal_faces_the_player");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void directionalLookingDownFacesUp(GameTestHelper helper) {
        play(helper, "directional_looking_down_faces_up");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void directionalLookingUpFacesDown(GameTestHelper helper) {
        play(helper, "directional_looking_up_faces_down");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void slabBottomOnTheFloor(GameTestHelper helper) {
        play(helper, "slab_bottom_on_the_floor");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void slabTopFromAHighSideClick(GameTestHelper helper) {
        play(helper, "slab_top_from_a_high_side_click");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void slabTopFromBelow(GameTestHelper helper) {
        play(helper, "slab_top_from_below");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void slabDoublesWhenClickedOnTop(GameTestHelper helper) {
        play(helper, "slab_doubles_when_clicked_on_top");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void slabDoublesFromBeside(GameTestHelper helper) {
        play(helper, "slab_doubles_from_beside");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void slabTopDoublesFromBelow(GameTestHelper helper) {
        play(helper, "slab_top_doubles_from_below");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsFaceTheLook(GameTestHelper helper) {
        play(helper, "stairs_face_the_look");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsUpsideDownFromAHighClick(GameTestHelper helper) {
        play(helper, "stairs_upside_down_from_a_high_click");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsOuterCorner(GameTestHelper helper) {
        play(helper, "stairs_outer_corner");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsOuterCornerOtherSide(GameTestHelper helper) {
        play(helper, "stairs_outer_corner_other_side");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsInnerCorner(GameTestHelper helper) {
        play(helper, "stairs_inner_corner");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsInnerCornerOtherSide(GameTestHelper helper) {
        play(helper, "stairs_inner_corner_other_side");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsCornerPlacedFirst(GameTestHelper helper) {
        play(helper, "stairs_corner_placed_first");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsCornerBlockedByARow(GameTestHelper helper) {
        play(helper, "stairs_corner_blocked_by_a_row");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stairsHalvesDoNotCorner(GameTestHelper helper) {
        play(helper, "stairs_halves_do_not_corner");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void wallAloneHasAPost(GameTestHelper helper) {
        play(helper, "wall_alone_has_a_post");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void wallLineDropsTheMiddlePost(GameTestHelper helper) {
        play(helper, "wall_line_drops_the_middle_post");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void wallUnderABlockIsTall(GameTestHelper helper) {
        play(helper, "wall_under_a_block_is_tall");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void wallUnderAWall(GameTestHelper helper) {
        play(helper, "wall_under_a_wall");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void wallCornerKeepsItsPost(GameTestHelper helper) {
        play(helper, "wall_corner_keeps_its_post");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void wallJoinsBlocksAndPanes(GameTestHelper helper) {
        play(helper, "wall_joins_blocks_and_panes");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void fenceAloneIsAPost(GameTestHelper helper) {
        play(helper, "fence_alone_is_a_post");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void fencesJoinEachOtherAndBlocks(GameTestHelper helper) {
        play(helper, "fences_join_each_other_and_blocks");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void woodenAndStoneFencesDoNotJoin(GameTestHelper helper) {
        play(helper, "wooden_and_stone_fences_do_not_join");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void fenceJoinsAGateByItsSides(GameTestHelper helper) {
        play(helper, "fence_joins_a_gate_by_its_sides");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void paneAndFenceDoNotJoin(GameTestHelper helper) {
        play(helper, "pane_and_fence_do_not_join");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void panesJoinEachOther(GameTestHelper helper) {
        play(helper, "panes_join_each_other");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void gateFacesTheLook(GameTestHelper helper) {
        play(helper, "gate_faces_the_look");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void gateOpensAwayFromThePlayer(GameTestHelper helper) {
        play(helper, "gate_opens_away_from_the_player");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void gateInAWallIsLowered(GameTestHelper helper) {
        play(helper, "gate_in_a_wall_is_lowered");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void doorFacesTheLookAndHingesByTheClick(GameTestHelper helper) {
        play(helper, "door_faces_the_look_and_hinges_by_the_click");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void doorHingeFacingEast(GameTestHelper helper) {
        play(helper, "door_hinge_facing_east");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void doorsPairTheirHinges(GameTestHelper helper) {
        play(helper, "doors_pair_their_hinges");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void doorHingeFollowsSolidBlocks(GameTestHelper helper) {
        play(helper, "door_hinge_follows_solid_blocks");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void doorOpensByHand(GameTestHelper helper) {
        play(helper, "door_opens_by_hand");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void ironDoorByHand(GameTestHelper helper) {
        play(helper, "iron_door_by_hand");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void goldDoorByHand(GameTestHelper helper) {
        play(helper, "gold_door_by_hand");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stoneDoorByHand(GameTestHelper helper) {
        play(helper, "stone_door_by_hand");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void copperDoorByHand(GameTestHelper helper) {
        play(helper, "copper_door_by_hand");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void doorBreaksWithBothHalves(GameTestHelper helper) {
        play(helper, "door_breaks_with_both_halves");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void doorNeedsGround(GameTestHelper helper) {
        play(helper, "door_needs_ground");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void trapdoorOnASide(GameTestHelper helper) {
        play(helper, "trapdoor_on_a_side");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void trapdoorOnFloorAndCeiling(GameTestHelper helper) {
        play(helper, "trapdoor_on_floor_and_ceiling");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void trapdoorOpensByHandIronDoesNot(GameTestHelper helper) {
        play(helper, "trapdoor_opens_by_hand_iron_does_not");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void buttonOnFloorWallAndCeiling(GameTestHelper helper) {
        play(helper, "button_on_floor_wall_and_ceiling");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void woodenButtonStaysPressed30Ticks(GameTestHelper helper) {
        play(helper, "wooden_button_stays_pressed_30_ticks");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stoneButtonStaysPressed20Ticks(GameTestHelper helper) {
        play(helper, "stone_button_stays_pressed_20_ticks");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void buttonPressTicks(GameTestHelper helper) {
        play(helper, "button_press_ticks");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void buttonGoesWithItsBlock(GameTestHelper helper) {
        play(helper, "button_goes_with_its_block");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void woodenPlateReleasesAfter20Ticks(GameTestHelper helper) {
        play(helper, "wooden_plate_releases_after_20_ticks");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void stonePlateReleasesAfter20Ticks(GameTestHelper helper) {
        play(helper, "stone_plate_releases_after_20_ticks");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void weightedPlatePower(GameTestHelper helper) {
        play(helper, "weighted_plate_power");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void plateRestsOnAFenceNotASlab(GameTestHelper helper) {
        play(helper, "plate_rests_on_a_fence_not_a_slab");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void signalPlacedRunsOnPlace(GameTestHelper helper) {
        play(helper, "signal_placed_runs_on_place");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void signalUsedRunsOnInteract(GameTestHelper helper) {
        play(helper, "signal_used_runs_on_interact");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void signalBrokenRunsOnBreak(GameTestHelper helper) {
        play(helper, "signal_broken_runs_on_break");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void signalSteppedOnRunsOnStep(GameTestHelper helper) {
        play(helper, "signal_stepped_on_runs_on_step");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void signalInOrder(GameTestHelper helper) {
        play(helper, "signal_in_order");
    }

    @GameTest(maxTicks = MAX_TICKS)
    public void leavesPlaceAsABlock(GameTestHelper helper) {
        play(helper, "leaves_place_as_a_block");
    }

    // The file and the fixture

    @GameTest
    public void everyScenarioHasAGameTest(GameTestHelper helper) {
        TreeSet<String> inFile = new TreeSet<>();
        for (JsonElement scenario : document().getAsJsonArray("scenarios")) {
            String name = scenario.getAsJsonObject().get("name").getAsString();
            helper.assertTrue(inFile.add(name), "scenario " + name + " is listed twice");
        }
        TreeSet<String> tests = new TreeSet<>();
        for (Method method : MsmSimParityGameTest.class.getDeclaredMethods()) {
            if (method.isAnnotationPresent(GameTest.class) && !method.getName().equals("everyScenarioHasAGameTest")
                    && !method.getName().equals("fixtureModIsLoaded")) {
                tests.add(snakeCase(method.getName()));
            }
        }
        helper.assertValueEqual(tests, inFile, "GameTests against the scenarios of scenarios.json");
        helper.succeed();
    }

    @GameTest
    public void fixtureModIsLoaded(GameTestHelper helper) {
        for (String path : List.of("base", "signal", "stairs", "door", "plate", "weighted_plate")) {
            Identifier id = Identifier.fromNamespaceAndPath(NS, path);
            helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id), "block " + id + " is not registered (is fabric.addMods set?)");
        }
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains(NS)).toList();
        helper.assertTrue(errors.isEmpty(), "errors loading the fixture: " + errors);
        helper.succeed();
    }

    /** {@code stairsOuterCorner} to {@code stairs_outer_corner}; a number starts a word ({@code pressed30Ticks}). */
    static String snakeCase(String camel) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < camel.length(); i++) {
            char c = camel.charAt(i);
            boolean digitStarts = Character.isDigit(c) && i > 0 && !Character.isDigit(camel.charAt(i - 1));
            if (Character.isUpperCase(c) || digitStarts) {
                out.append('_');
            }
            out.append(Character.toLowerCase(c));
        }
        return out.toString();
    }

    private static Path file() {
        String path = System.getProperty("msm.sim.parity.scenarios");
        if (path == null || path.isBlank()) {
            throw new IllegalStateException("msm.sim.parity.scenarios is not set; run through engine-mod's runGameTest");
        }
        return Path.of(path);
    }

    private static boolean updating() {
        return Boolean.getBoolean("msm.sim.parity.update");
    }

    private static synchronized JsonObject document() {
        if (document == null) {
            try {
                document = JsonParser.parseString(Files.readString(file(), StandardCharsets.UTF_8)).getAsJsonObject();
            } catch (IOException e) {
                throw new IllegalStateException("cannot read " + file(), e);
            }
            if (document.get("format").getAsInt() != 1) {
                throw new IllegalStateException(file() + ": format " + document.get("format") + ", expected 1");
            }
        }
        return document;
    }

    private static synchronized void writeDocument() {
        try {
            Files.writeString(file(), CompactJson.write(document()) + "\n", StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("cannot write " + file(), e);
        }
    }

    private static JsonObject scenario(String name) {
        for (JsonElement scenario : document().getAsJsonArray("scenarios")) {
            if (scenario.getAsJsonObject().get("name").getAsString().equals(name)) {
                return scenario.getAsJsonObject();
            }
        }
        throw new IllegalArgumentException("no scenario " + name + " in " + file());
    }

    private static void play(GameTestHelper helper, String name) {
        new Run(helper, scenario(name)).start();
    }

    /** One scenario being played. */
    private static final class Run implements EventListener {
        private final GameTestHelper helper;
        private final JsonObject scenario;
        private final String name;
        private final ServerLevel level;
        private final BlockPos origin;
        private final ServerPlayer player;
        private final List<String> problems = new ArrayList<>();
        private final JsonArray events = new JsonArray();
        private final JsonArray actions = new JsonArray();

        Run(GameTestHelper helper, JsonObject scenario) {
            this.helper = helper;
            this.scenario = scenario;
            this.name = scenario.get("name").getAsString();
            this.level = helper.getLevel();
            this.origin = helper.absolutePos(BlockPos.ZERO);
            this.player = helper.makeMockServerPlayerInLevel();
            player.setGameMode(GameType.CREATIVE);
            park();
        }

        void start() {
            for (int x = 0; x < AREA; x++) {
                for (int z = 0; z < AREA; z++) {
                    helper.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
                }
            }
            EventRunner.addListener(this);
            runFrom(0);
        }

        private void runFrom(int index) {
            try {
                JsonArray steps = scenario.getAsJsonArray("steps");
                for (int i = index; i < steps.size(); i++) {
                    JsonObject step = steps.get(i).getAsJsonObject();
                    String where = "step " + (i + 1) + " (" + step.get("step").getAsString() + ")";
                    if (step.get("step").getAsString().equals("wait")) {
                        int next = i + 1;
                        helper.runAfterDelay(step.get("ticks").getAsInt(), () -> {
                            expect(step, where);
                            runFrom(next);
                        });
                        return;
                    }
                    perform(step, where);
                    expect(step, where);
                }
            } catch (RuntimeException e) {
                EventRunner.removeListener(this);
                throw e;
            }
            finish();
        }

        private void finish() {
            EventRunner.removeListener(this);
            if (updating()) {
                scenario.add("events", events);
                scenario.add("actions", actions);
                writeDocument();
                helper.succeed();
                return;
            }
            compareList("events", scenario.getAsJsonArray("events"), events);
            compareList("actions", scenario.getAsJsonArray("actions"), actions);
            if (problems.isEmpty()) {
                helper.succeed();
            } else {
                helper.fail("sim parity scenario " + name + ":\n  " + String.join("\n  ", problems));
            }
        }

        private void compareList(String what, JsonArray expected, JsonArray actual) {
            List<String> want = new ArrayList<>();
            expected.forEach(e -> want.add(CompactJson.inline(e)));
            List<String> got = new ArrayList<>();
            actual.forEach(e -> got.add(CompactJson.inline(e)));
            if (!want.equals(got)) {
                problems.add(what + ": expected " + want + ", got " + got);
            }
        }

        // Positions

        private BlockPos abs(JsonArray pos) {
            return origin.offset(pos.get(0).getAsInt(), pos.get(1).getAsInt() + 1, pos.get(2).getAsInt());
        }

        private JsonArray scenarioPos(BlockPos abs) {
            JsonArray out = new JsonArray();
            out.add(abs.getX() - origin.getX());
            out.add(abs.getY() - origin.getY() - 1);
            out.add(abs.getZ() - origin.getZ());
            return out;
        }

        private boolean inArea(BlockPos abs) {
            int x = abs.getX() - origin.getX();
            int y = abs.getY() - origin.getY();
            int z = abs.getZ() - origin.getZ();
            return x >= 0 && x < AREA && y >= 0 && y < AREA && z >= 0 && z < AREA;
        }

        /** Above the area, out of every scenario's way. */
        private void park() {
            player.setPos(Vec3.atLowerCornerOf(origin).add(AREA / 2.0, AREA + 1, AREA / 2.0));
            player.setDeltaMovement(Vec3.ZERO);
        }

        private void look(JsonObject step) {
            float yaw = step.has("yaw") ? step.get("yaw").getAsFloat() : 0;
            float pitch = step.has("pitch") ? step.get("pitch").getAsFloat() : 0;
            player.setYRot(yaw);
            player.setYHeadRot(yaw);
            player.setXRot(pitch);
        }

        // Steps

        private void perform(JsonObject step, String where) {
            switch (step.get("step").getAsString()) {
                case "place" -> {
                    Identifier id = Identifier.parse(step.get("block").getAsString());
                    Item item = BuiltInRegistries.ITEM.getValue(id);
                    if (item == Items.AIR) {
                        throw new IllegalStateException(where + ": no item " + id);
                    }
                    look(step);
                    click(step, new ItemStack(item, 64));
                }
                case "use" -> {
                    look(step);
                    click(step, ItemStack.EMPTY);
                }
                case "step_on" -> {
                    BlockPos at = abs(step.getAsJsonArray("pos"));
                    BlockState state = level.getBlockState(at);
                    if (state.getBlock() instanceof BasePressurePlateBlock) {
                        player.setPos(Vec3.atBottomCenterOf(at));
                        state.entityInside(level, at, player, InsideBlockEffectApplier.NOOP, true);
                    } else {
                        player.setPos(Vec3.atBottomCenterOf(at.above()));
                        state.getBlock().stepOn(level, at, state, player);
                    }
                    park();
                }
                case "break" -> player.gameMode.destroyBlock(abs(step.getAsJsonArray("pos")));
                default -> throw new IllegalStateException(where + ": unknown step");
            }
        }

        /** A right-click with {@code stack} in the main hand, as the network handler hands it over. */
        private void click(JsonObject step, ItemStack stack) {
            BlockPos at = abs(step.getAsJsonArray("pos"));
            Direction face = face(step.has("face") ? step.get("face").getAsString() : "up");
            Vec3 hit;
            if (step.has("hit")) {
                JsonArray h = step.getAsJsonArray("hit");
                hit = Vec3.atLowerCornerOf(at).add(h.get(0).getAsDouble(), h.get(1).getAsDouble(), h.get(2).getAsDouble());
            } else {
                hit = Vec3.atCenterOf(at).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
            }
            player.setItemInHand(InteractionHand.MAIN_HAND, stack);
            player.gameMode.useItemOn(player, level, stack, InteractionHand.MAIN_HAND, new BlockHitResult(hit, face, at, false));
            player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        }

        private static Direction face(String name) {
            return switch (name) {
                case "down" -> Direction.DOWN;
                case "up" -> Direction.UP;
                case "north" -> Direction.NORTH;
                case "south" -> Direction.SOUTH;
                case "west" -> Direction.WEST;
                case "east" -> Direction.EAST;
                default -> throw new IllegalArgumentException("unknown face " + name);
            };
        }

        // Expectations

        private void expect(JsonObject step, String where) {
            if (!step.has("expect")) {
                return;
            }
            JsonObject expect = step.getAsJsonObject("expect");
            if (expect.has("blocks")) {
                for (JsonElement entry : expect.getAsJsonArray("blocks")) {
                    JsonObject block = entry.getAsJsonObject();
                    BlockPos at = abs(block.getAsJsonArray("pos"));
                    String wanted = block.get("state").getAsString();
                    String actual = describe(level.getBlockState(at), wanted);
                    if (updating()) {
                        block.addProperty("state", actual);
                    } else if (!actual.equals(wanted)) {
                        problems.add(where + ": block at " + block.get("pos") + " expected " + wanted + ", got " + actual);
                    }
                }
            }
            if (expect.has("shapes")) {
                for (JsonElement entry : expect.getAsJsonArray("shapes")) {
                    JsonObject shape = entry.getAsJsonObject();
                    BlockPos at = abs(shape.getAsJsonArray("pos"));
                    BlockState state = level.getBlockState(at);
                    JsonElement outline = bounds(state.getShape(level, at, CollisionContext.empty()));
                    JsonElement collision = bounds(state.getCollisionShape(level, at, CollisionContext.empty()));
                    if (updating()) {
                        shape.add("outline", outline);
                        shape.add("collision", collision);
                    } else {
                        compareBounds(where, shape, "outline", outline);
                        compareBounds(where, shape, "collision", collision);
                    }
                }
            }
        }

        private void compareBounds(String where, JsonObject shape, String key, JsonElement actual) {
            JsonElement wanted = shape.has(key) ? shape.get(key) : JsonNull.INSTANCE;
            boolean same = wanted.isJsonNull() == actual.isJsonNull();
            if (same && !wanted.isJsonNull()) {
                JsonArray a = wanted.getAsJsonArray();
                JsonArray b = actual.getAsJsonArray();
                for (int i = 0; i < 6; i++) {
                    same &= a.size() == 6 && Math.abs(a.get(i).getAsDouble() - b.get(i).getAsDouble()) < EPS;
                }
            }
            if (!same) {
                problems.add(where + ": " + key + " at " + shape.get("pos") + " expected " + CompactJson.inline(wanted) + ", got "
                        + CompactJson.inline(actual));
            }
        }

        /** The bounds of a shape in pixels, or null for an empty shape. */
        private static JsonElement bounds(VoxelShape shape) {
            if (shape.isEmpty()) {
                return JsonNull.INSTANCE;
            }
            AABB box = shape.bounds();
            JsonArray out = new JsonArray();
            for (double v : new double[] {box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ}) {
                out.add(CompactJson.number(v * 16));
            }
            return out;
        }

        /**
         * A state as {@code namespace:path[a=1,b=2]} with the properties {@code like} lists, in its order; any air is
         * {@code minecraft:air}. A listed property the state does not have reads {@code ?}.
         */
        private static String describe(BlockState state, String like) {
            if (state.isAir()) {
                return "minecraft:air";
            }
            String id = BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
            int open = like.indexOf('[');
            if (open < 0) {
                return id;
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (Property<?> property : state.getProperties()) {
                values.put(property.getName(), valueName(state, property));
            }
            List<String> parts = new ArrayList<>();
            for (String pair : like.substring(open + 1, like.length() - 1).split(",")) {
                String key = pair.substring(0, pair.indexOf('='));
                parts.add(key + "=" + values.getOrDefault(key, "?"));
            }
            return id + "[" + String.join(",", parts) + "]";
        }

        private static <T extends Comparable<T>> String valueName(BlockState state, Property<T> property) {
            return property.getName(state.getValue(property));
        }

        // Runtime events of this area's sim_parity blocks

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (!owner.getNamespace().equals(NS) || ctx.base() == null || !inArea(ctx.base())) {
                return;
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("owner", owner.toString());
            entry.addProperty("event", event.toString());
            entry.addProperty("depth", depth);
            entry.add("pos", scenarioPos(ctx.base()));
            events.add(entry);
        }

        @Override
        public void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {
            if (!owner.getNamespace().equals(NS) || ctx.base() == null || !inArea(ctx.base())) {
                return;
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("event", event.toString());
            entry.addProperty("type", action.type().serialName);
            actions.add(entry);
        }
    }

    /**
     * The file's JSON layout: two-space indents, and an array or object on one line when it fits in 150 columns.
     * Rewriting an unchanged file gives the same text.
     */
    static final class CompactJson {
        private static final int WIDTH = 150;

        private CompactJson() {}

        static JsonPrimitive number(double value) {
            double rounded = Math.round(value * 10000) / 10000.0;
            if (rounded == Math.rint(rounded)) {
                return new JsonPrimitive((long) rounded);
            }
            return new JsonPrimitive(rounded);
        }

        static String write(JsonElement element) {
            StringBuilder out = new StringBuilder();
            write(element, 0, 0, out);
            return out.toString();
        }

        /** One line. */
        static String inline(JsonElement element) {
            if (element == null || element.isJsonNull()) {
                return "null";
            }
            if (element.isJsonPrimitive()) {
                return primitive(element.getAsJsonPrimitive());
            }
            List<String> parts = new ArrayList<>();
            if (element.isJsonArray()) {
                element.getAsJsonArray().forEach(e -> parts.add(inline(e)));
                return "[" + String.join(", ", parts) + "]";
            }
            for (Map.Entry<String, JsonElement> e : element.getAsJsonObject().entrySet()) {
                parts.add(quote(e.getKey()) + ": " + inline(e.getValue()));
            }
            return "{" + String.join(", ", parts) + "}";
        }

        private static void write(JsonElement element, int indent, int used, StringBuilder out) {
            String line = inline(element);
            boolean container = element.isJsonArray() || element.isJsonObject();
            boolean empty = (element.isJsonArray() && element.getAsJsonArray().isEmpty())
                    || (element.isJsonObject() && element.getAsJsonObject().isEmpty());
            if (!container || empty || indent > 0 && used + line.length() <= WIDTH) {
                out.append(line);
                return;
            }
            String inner = " ".repeat(indent + 2);
            if (element.isJsonArray()) {
                out.append("[\n");
                JsonArray array = element.getAsJsonArray();
                for (int i = 0; i < array.size(); i++) {
                    out.append(inner);
                    write(array.get(i), indent + 2, inner.length(), out);
                    out.append(i + 1 < array.size() ? ",\n" : "\n");
                }
                out.append(" ".repeat(indent)).append(']');
                return;
            }
            out.append("{\n");
            List<Map.Entry<String, JsonElement>> entries = new ArrayList<>(element.getAsJsonObject().entrySet());
            for (int i = 0; i < entries.size(); i++) {
                String key = quote(entries.get(i).getKey()) + ": ";
                out.append(inner).append(key);
                write(entries.get(i).getValue(), indent + 2, inner.length() + key.length(), out);
                out.append(i + 1 < entries.size() ? ",\n" : "\n");
            }
            out.append(" ".repeat(indent)).append('}');
        }

        private static String primitive(JsonPrimitive primitive) {
            if (primitive.isString()) {
                return quote(primitive.getAsString());
            }
            if (primitive.isNumber()) {
                Number n = primitive.getAsNumber();
                double d = n.doubleValue();
                return d == Math.rint(d) && Math.abs(d) < 1e15 ? Long.toString((long) d) : Double.toString(d);
            }
            return primitive.toString();
        }

        private static String quote(String text) {
            StringBuilder out = new StringBuilder("\"");
            for (char c : text.toCharArray()) {
                switch (c) {
                    case '"' -> out.append("\\\"");
                    case '\\' -> out.append("\\\\");
                    case '\n' -> out.append("\\n");
                    default -> {
                        if (c < 0x20) {
                            out.append(String.format("\\u%04x", (int) c));
                        } else {
                            out.append(c);
                        }
                    }
                }
            }
            return out.append('"').toString();
        }
    }
}
