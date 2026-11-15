package dev.mcsupermods.runtime.registry.vehicle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mcsupermods.runtime.loader.VehicleDefinition.Mode;
import dev.mcsupermods.runtime.registry.vehicle.VehiclePhysics.Constants;
import dev.mcsupermods.runtime.registry.vehicle.VehiclePhysics.Env;
import dev.mcsupermods.runtime.registry.vehicle.VehiclePhysics.Input;
import dev.mcsupermods.runtime.registry.vehicle.VehiclePhysics.State;
import org.junit.jupiter.api.Test;

/** The rules of {@link VehiclePhysics} checked by hand, independently of the golden. */
class VehiclePhysicsTest {
    private static final double EPS = 1e-9;
    private static final Env GROUND = new Env(true, 0, true);
    private static final Env GROUND_NO_ENGINE = new Env(true, 0, false);
    private static final Env AIRBORNE = new Env(false, 0, true);

    private static Constants defaults(Mode mode) {
        return Constants.resolve(mode, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static Input keys(boolean forward, boolean back, boolean left, boolean right) {
        return new Input(forward, back, left, right, false, false, 0, 0);
    }

    private static State run(Constants c, State s, Input in, Env env, int ticks) {
        for (int i = 0; i < ticks; i++) {
            s = VehiclePhysics.step(c, s, in, env);
        }
        return s;
    }

    @Test
    void defaultsFollowTheMode() {
        Constants ground = defaults(Mode.GROUND);
        assertEquals(0.4, ground.maxSpeed(), EPS);
        assertEquals(0.02, ground.acceleration(), EPS);
        assertEquals(0.04, ground.braking(), EPS);
        assertEquals(5, ground.turnRate(), EPS);
        assertEquals(1, ground.stepHeight(), EPS);
        assertEquals(0.4, ground.reverseFactor(), EPS);
        assertEquals(0.8, ground.grip(), EPS);
        assertEquals(0.15, ground.liftSpeed(), EPS);
        assertEquals(0.2, ground.takeoffSpeed(), EPS);
        assertFalse(ground.turnsInPlace());
        assertFalse(ground.floats());
        Constants water = defaults(Mode.WATER);
        assertEquals(0.35, water.maxSpeed(), EPS);
        assertEquals(0.015, water.acceleration(), EPS);
        assertEquals(0.03, water.braking(), EPS);
        assertEquals(4, water.turnRate(), EPS);
        assertEquals(0, water.stepHeight(), EPS);
        Constants air = defaults(Mode.AIR);
        assertEquals(1.2, air.maxSpeed(), EPS);
        assertEquals(0.03, air.acceleration(), EPS);
        assertEquals(3, air.turnRate(), EPS);
        assertEquals(0.6, air.takeoffSpeed(), EPS);
        Constants hover = defaults(Mode.HOVER);
        assertEquals(0.5, hover.maxSpeed(), EPS);
        assertEquals(0.04, hover.acceleration(), EPS);
        assertEquals(0.06, hover.braking(), EPS);
        assertEquals(8, hover.turnRate(), EPS);
        Constants amphibious = defaults(Mode.AMPHIBIOUS);
        assertEquals(0.4, amphibious.maxSpeed(), EPS);
        assertEquals(5, amphibious.turnRate(), EPS);
        assertEquals(1, amphibious.stepHeight(), EPS);
        Constants given = Constants.resolve(Mode.AIR, 2.0, null, null, null, null, null, null, null, null, null, null);
        assertEquals(1, given.takeoffSpeed(), EPS, "takeoff_speed is half of the given max_speed");
    }

    @Test
    void groundAcceleratesToTheTopSpeedAndNoFurther() {
        Constants c = defaults(Mode.GROUND);
        State s = run(c, State.at(0), keys(true, false, false, false), GROUND, 5);
        assertEquals(0.1, s.speed(), EPS);
        assertEquals(0.1, s.vz(), EPS, "yaw 0 faces south (+z)");
        assertEquals(1, s.throttle(), EPS);
        s = run(c, s, keys(true, false, false, false), GROUND, 100);
        assertEquals(0.4, s.speed(), EPS);
    }

    @Test
    void backBrakesThenReversesUpToItsShare() {
        Constants c = defaults(Mode.GROUND);
        State s = new State(0, 0, 0.1, 0, 0, 0, 0, 0);
        s = VehiclePhysics.step(c, s, keys(false, true, false, false), GROUND);
        assertEquals(0.06, s.speed(), EPS, "braking 0.04 a tick");
        assertEquals(0, s.throttle(), EPS, "braking is no throttle");
        s = run(c, s, keys(false, true, false, false), GROUND, 2);
        assertEquals(0, s.speed(), EPS, "stops before reversing");
        s = run(c, s, keys(false, true, false, false), GROUND, 100);
        assertEquals(-0.16, s.speed(), EPS, "reverse at 0.4 of 0.4");
        assertEquals(-1, s.throttle(), EPS);
    }

    @Test
    void withoutTheEngineItCoastsAndStops() {
        Constants c = defaults(Mode.GROUND);
        State s = VehiclePhysics.step(c, new State(0, 0, 0.2, 0, 0, 0, 0, 0), keys(true, false, false, false), GROUND_NO_ENGINE);
        assertEquals(0.2 * VehiclePhysics.GROUND_COAST, s.speed(), EPS);
        s = run(c, s, keys(false, false, false, false), GROUND, 200);
        assertEquals(0, s.speed(), EPS, "coasted to a stop");
    }

    @Test
    void turningScalesWithSpeedAndReversesInReverse() {
        Constants c = defaults(Mode.GROUND);
        State still = VehiclePhysics.step(c, State.at(0), keys(false, false, false, true), GROUND);
        assertEquals(0, still.yaw(), EPS, "a car does not turn standing still");
        State slow = VehiclePhysics.step(c, new State(0, 0, 0.1, 0, 0, 0, 0, 0), keys(false, false, false, true), GROUND);
        assertEquals(5 * (0.1 * VehiclePhysics.GROUND_COAST) / 0.2, slow.yaw(), EPS, "half rate at a quarter of top speed");
        State fast = VehiclePhysics.step(c, new State(0, 0, 0.3, 0, 0, 0, 0, 0), keys(false, false, false, true), GROUND);
        assertEquals(5, fast.yaw(), EPS, "full rate from half of top speed");
        assertEquals(1, fast.steering(), EPS);
        State reversing = VehiclePhysics.step(c, new State(0, 0, -0.15, 0, 0, 0, 0, 0), keys(false, false, false, true), GROUND);
        assertTrue(reversing.yaw() < 0, "reversing turns the other way: " + reversing.yaw());
    }

    @Test
    void aTankTurnsInPlaceOnlyWithItsEngine() {
        Constants tank = Constants.resolve(Mode.GROUND, null, null, null, null, 3.0, true, null, null, null, null, null);
        assertEquals(3, VehiclePhysics.step(tank, State.at(0), keys(false, false, false, true), GROUND).yaw(), EPS);
        assertEquals(0, VehiclePhysics.step(tank, State.at(0), keys(false, false, false, true), GROUND_NO_ENGINE).yaw(), EPS);
    }

    @Test
    void gripTurnsTheVelocityWithTheFacing() {
        Constants full = Constants.resolve(Mode.GROUND, null, null, null, null, 10.0, null, null, 1.0, null, null, null);
        State s = VehiclePhysics.step(full, new State(0, 0, 0.3, 0, 0, 0, 0, 0), keys(false, false, false, true), GROUND);
        double rad = Math.toRadians(s.yaw());
        assertEquals(-Math.sin(rad) * s.speed(), s.vx(), EPS, "grip 1: all along the new facing");
        Constants none = Constants.resolve(Mode.GROUND, null, null, null, null, 10.0, null, null, 0.0, null, null, null);
        State drift = VehiclePhysics.step(none, new State(0, 0, 0.3, 0, 0, 0, 0, 0), keys(false, false, false, true), GROUND);
        assertEquals(0, drift.vx(), EPS, "grip 0: the velocity keeps its direction");
    }

    @Test
    void inTheAirThereIsNoControl() {
        Constants c = defaults(Mode.GROUND);
        State s = VehiclePhysics.step(c, new State(0, 0, 0.2, 0, 0, 0, 0, 0), keys(true, false, false, true), AIRBORNE);
        assertEquals(0.2 * VehiclePhysics.AIR_DRAG, s.vz(), EPS);
        assertEquals(-VehiclePhysics.GRAVITY * VehiclePhysics.AIR_DRAG, s.vy(), EPS);
        assertEquals(0, s.yaw(), EPS);
    }

    @Test
    void groundVehiclesSinkInDeepWaterAndWadeThroughShallowWater() {
        Constants c = defaults(Mode.GROUND);
        State sunk = VehiclePhysics.step(c, State.at(0), keys(true, false, false, false), new Env(true, 1.5, true));
        assertTrue(sunk.vy() < 0, "sinks");
        assertEquals(0, sunk.speed(), EPS, "no thrust under water");
        State wading = VehiclePhysics.step(c, State.at(0), keys(true, false, false, false), new Env(true, 0.3, true));
        assertEquals(0.02, wading.speed(), EPS, "drives through shallow water");
        Constants raft = Constants.resolve(Mode.GROUND, null, null, null, null, null, null, null, null, null, null, true);
        State floating = VehiclePhysics.step(raft, State.at(0), keys(true, false, false, false), new Env(false, 0.5, true));
        assertTrue(floating.vy() > 0, "floats: pushed up");
        assertEquals(0.002, floating.speed(), EPS, "drives at a tenth on water");
    }

    @Test
    void aFloatingHullRestsAtTheDraft() {
        assertEquals(0, VehiclePhysics.buoyancy(0, VehiclePhysics.DRAFT), EPS, "no push at the draft");
        assertTrue(VehiclePhysics.buoyancy(0, 1) > 0, "pushed up when deep");
        assertEquals(VehiclePhysics.MAX_BUOYANCY * VehiclePhysics.WATER_DAMPING, VehiclePhysics.buoyancy(0, 5), EPS, "capped");
    }

    @Test
    void boatsCrawlOnLandAndTurnStandingStillOnWater() {
        Constants c = defaults(Mode.WATER);
        State land = run(c, State.at(0), keys(true, false, false, false), GROUND, 50);
        assertEquals(0.035, land.speed(), EPS, "a tenth of 0.35 on land");
        State turn = VehiclePhysics.step(c, State.at(0), keys(false, false, false, true), new Env(false, 0.12, true));
        assertEquals(4 * VehiclePhysics.WATER_MIN_TURN, turn.yaw(), EPS);
    }

    @Test
    void aPlaneNeedsTakeoffSpeedToClimbAndStallsWithoutThrust() {
        Constants c = defaults(Mode.AIR);
        State s = VehiclePhysics.step(c, new State(0, 0, 0.3, 0, 0, 0.5, 0, 0), new Input(true, false, false, false, false, false, 0, -30), GROUND);
        assertEquals(0.55, s.throttle(), EPS, "the lever moves 0.05 a tick");
        assertEquals(0, s.pitch(), EPS, "no nose up below takeoff speed");
        State fast = VehiclePhysics.step(c, new State(0, 0, 0.7, 0, 0, 0.8, 0, 0), new Input(true, false, false, false, false, false, 0, -30), GROUND);
        assertEquals(-3, fast.pitch(), EPS, "the nose lifts at the turn rate");
        assertTrue(fast.vy() > -VehiclePhysics.GRAVITY, "climbing");
        State stall = new State(0, 0, 0, 0, 0, 0, 0, 0);
        stall = run(c, stall, Input.idle(0, 0), new Env(false, 0, false), 10);
        assertTrue(stall.vy() < -0.3, "a plane without speed falls: " + stall.vy());
        State cruising = run(c, new State(0, 0, 1.2, 0, 0, 1, 0, 0), new Input(false, false, false, false, false, false, 90, 0), AIRBORNE, 1);
        assertEquals(3, cruising.yaw(), EPS, "the nose follows the view at 3 a tick");
        assertEquals(1.2, cruising.speed(), EPS);
        assertEquals(0, cruising.vy(), EPS, "level flight above takeoff speed");
    }

    @Test
    void hoverMovesWithTheViewHoldsItsHeightAndSinksWithoutPower() {
        Constants c = defaults(Mode.HOVER);
        State s = VehiclePhysics.step(c, State.at(0), new Input(true, false, false, false, true, false, 0, 0), AIRBORNE);
        assertEquals(0.04, s.vz(), EPS, "forwards at the acceleration");
        assertEquals(0.04, s.vy(), EPS, "climbing at the acceleration");
        s = run(c, s, new Input(true, false, false, false, true, false, 0, 0), AIRBORNE, 50);
        assertEquals(0.5, s.vz(), EPS, "top speed");
        assertEquals(0.15, s.vy(), EPS, "lift speed");
        s = run(c, s, Input.idle(0, 0), AIRBORNE, 50);
        assertEquals(0, s.vy(), EPS, "holds its height");
        assertEquals(0, s.vz(), EPS, "stops");
        State turned = VehiclePhysics.step(c, State.at(0), Input.idle(-170, 0), AIRBORNE);
        assertEquals(-8, turned.yaw(), EPS, "turns towards the view the short way");
        State unpowered = run(c, State.at(0), Input.idle(0, 0), new Env(false, 0, false), 100);
        assertEquals(-VehiclePhysics.HOVER_SINK, unpowered.vy(), EPS, "sinks slowly");
    }

    @Test
    void anglesWrapTheShortWay() {
        assertEquals(-170, VehiclePhysics.wrapDegrees(190), EPS);
        assertEquals(-180, VehiclePhysics.wrapDegrees(180), EPS);
        assertEquals(170, VehiclePhysics.wrapDegrees(-190), EPS);
        assertEquals(355, VehiclePhysics.approach(350, 10, 5), EPS, "350 towards 10 goes up through 360");
        assertEquals(370, VehiclePhysics.approach(350, 10, 30), EPS, "angles are not normalised (yaw is compared modulo 360)");
    }
}
