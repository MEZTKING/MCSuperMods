package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.loader.VehicleDefinition.Mode;

/**
 * The vehicles' own physics (ADR 0090 D3), written from the ADR: one tick of one vehicle from its constants, its state,
 * the driver's input and two facts about where it is. Pure: no Minecraft class, no world access, no randomness, doubles
 * throughout, so the Try it simulation's TypeScript twin gives the same numbers ({@code fixtures/vehicle-physics/golden.json},
 * the golden test). The side that moves the vehicle ({@link VehicleMovement}) feeds it only facts that both
 * sides know (on the ground, depth in water) and applies the velocity with the game's collision.
 *
 * <p>Angles are in degrees as the game's: yaw 0 faces south (+z) and grows turning right (clockwise seen from above), so
 * the facing is {@code (-sin yaw, 0, cos yaw)}; pitch is positive looking down. Speeds are blocks per tick.
 *
 * <p>Every constant below is MSM's own, chosen to feel close to vanilla boats and horses; none is copied from the game.
 */
public final class VehiclePhysics {
    private VehiclePhysics() {}

    // MSM's own constants (ADR 0090 D3).

    /** Downward pull per tick while nothing holds the vehicle up. */
    public static final double GRAVITY = 0.04;
    /** Velocity kept per tick in the air. */
    public static final double AIR_DRAG = 0.98;
    /** Speed kept per tick on land without throttle (rolling resistance). */
    public static final double GROUND_COAST = 0.95;
    /** Speed kept per tick on water without throttle. */
    public static final double WATER_COAST = 0.97;
    /** Share of top speed and acceleration out of its element: a boat on land, a floating car on water. */
    public static final double OUT_OF_ELEMENT = 0.1;
    /** Water deeper than this under a grounded land vehicle counts as water; shallower water is driven through. */
    public static final double WADE_DEPTH = 0.5;
    /** How deep below the waterline a floating hull rests, in blocks. */
    public static final double DRAFT = 0.12;
    /** Upward push per tick for each block the hull sits deeper than {@link #DRAFT}. */
    public static final double BUOYANCY = 0.1;
    /** The largest upward push per tick. */
    public static final double MAX_BUOYANCY = 0.1;
    /** Vertical speed kept per tick while floating (the bobbing dies down). */
    public static final double WATER_DAMPING = 0.75;
    /** Downward pull per tick of a vehicle that sinks. */
    public static final double SINK_GRAVITY = 0.02;
    /** Velocity kept per tick while sinking. */
    public static final double SINK_DRAG = 0.8;
    /** On water the velocity turns this share of the way towards the facing each tick (boats drift). */
    public static final double WATER_GRIP = 0.35;
    /** Turning reaches its full rate at this share of top speed; below it the rate scales with speed. */
    public static final double FULL_TURN_SHARE = 0.5;
    /** On water a powered hull turns at least at this share of its rate, even standing still. */
    public static final double WATER_MIN_TURN = 0.3;
    /** Throttle change per tick while forwards or back is held ({@code air}). */
    public static final double THROTTLE_STEP = 0.05;
    /** The steepest climb or dive of a plane, in degrees. */
    public static final double MAX_PITCH = 40;
    /** Share of a plane's sink kept per tick once it flies at {@code takeoff_speed} or faster. */
    public static final double STALL_RECOVERY = 0.8;
    /** The vertical speed an unpowered hovering vehicle sinks at. */
    public static final double HOVER_SINK = 0.05;
    /** How fast an unpowered hovering vehicle reaches {@link #HOVER_SINK}, per tick. */
    public static final double HOVER_SINK_STEP = 0.01;
    /** Horizontal speed kept per tick by an unpowered hovering vehicle. */
    public static final double HOVER_COAST = 0.9;
    /** Speeds below this become 0. */
    public static final double STOP = 0.001;

    /**
     * Defaults by mode (ADR 0090 D2, D3; {@code vehicle.mcdoc}): top speed, acceleration, braking, turn rate, step height.
     * {@code reverse_factor} 0.4, {@code grip} 0.8, {@code lift_speed} 0.15 and {@code takeoff_speed} half of top speed
     * for every mode.
     */
    public record Defaults(double maxSpeed, double acceleration, double braking, double turnRate, double stepHeight) {
        public static Defaults of(Mode mode) {
            return switch (mode) {
                case GROUND -> new Defaults(0.4, 0.02, 0.04, 5, 1);
                case WATER -> new Defaults(0.35, 0.015, 0.03, 4, 0);
                case AMPHIBIOUS -> new Defaults(0.4, 0.02, 0.04, 5, 1);
                case AIR -> new Defaults(1.2, 0.03, 0.03, 3, 0.5);
                case HOVER -> new Defaults(0.5, 0.04, 0.06, 8, 0);
            };
        }
    }

    public static final double DEFAULT_REVERSE_FACTOR = 0.4;
    public static final double DEFAULT_GRIP = 0.8;
    public static final double DEFAULT_LIFT_SPEED = 0.15;

    /** One vehicle type's movement, every default resolved. */
    public record Constants(Mode mode, double maxSpeed, double reverseFactor, double acceleration, double braking, double turnRate,
            boolean turnsInPlace, double stepHeight, double grip, double liftSpeed, double takeoffSpeed, boolean floats) {
        /**
         * Resolves absent values (null) by mode. The definition's numbers are single-precision floats; in game they are
         * widened to double here, the golden passes doubles.
         */
        public static Constants resolve(Mode mode, Double maxSpeed, Double reverseFactor, Double acceleration, Double braking,
                Double turnRate, Boolean turnsInPlace, Double stepHeight, Double grip, Double liftSpeed, Double takeoffSpeed,
                Boolean floats) {
            Defaults d = Defaults.of(mode);
            double max = maxSpeed != null ? maxSpeed : d.maxSpeed();
            return new Constants(mode, max,
                    reverseFactor != null ? reverseFactor : DEFAULT_REVERSE_FACTOR,
                    acceleration != null ? acceleration : d.acceleration(),
                    braking != null ? braking : d.braking(),
                    turnRate != null ? turnRate : d.turnRate(),
                    turnsInPlace != null && turnsInPlace,
                    stepHeight != null ? stepHeight : d.stepHeight(),
                    grip != null ? grip : DEFAULT_GRIP,
                    liftSpeed != null ? liftSpeed : DEFAULT_LIFT_SPEED,
                    takeoffSpeed != null ? takeoffSpeed : max / 2,
                    floats != null && floats);
        }

        /** A definition's movement, resolved. */
        public static Constants of(VehicleDefinition.Movement m) {
            return resolve(m.mode(), wide(m.maxSpeed().orElse(null)), wide(m.reverseFactor().orElse(null)), wide(m.acceleration().orElse(null)),
                    wide(m.braking().orElse(null)), wide(m.turnRate().orElse(null)), m.turnsInPlace(), wide(m.stepHeight().orElse(null)),
                    wide(m.grip().orElse(null)), wide(m.liftSpeed().orElse(null)), wide(m.takeoffSpeed().orElse(null)), m.floats());
        }

        private static Double wide(Float f) {
            return f == null ? null : (double) f;
        }
    }

    /**
     * The driver's input. {@code up} is jump, {@code down} the "Vehicle: descend" key (ADR 0088 D5); {@code viewYaw} and
     * {@code viewPitch} the driver's look, which {@code air} and {@code hover} follow.
     */
    public record Input(boolean forward, boolean back, boolean left, boolean right, boolean up, boolean down, double viewYaw,
            double viewPitch) {
        /** No keys, looking where the vehicle faces (no driver). */
        public static Input idle(double yaw, double pitch) {
            return new Input(false, false, false, false, false, false, yaw, pitch);
        }
    }

    /**
     * Where the vehicle is.
     *
     * @param onGround   standing on a block (the game's flag after the last move)
     * @param waterDepth how far the bottom of the hitbox is below the water surface, in blocks; 0 out of water
     * @param engine     a driver sits in the first seat and the vehicle needs no fuel or has some: the engine gives thrust
     */
    public record Env(boolean onGround, double waterDepth, boolean engine) {}

    /**
     * The vehicle's state. {@code vx}, {@code vy}, {@code vz}, {@code yaw}, {@code pitch} and {@code throttle} are read and
     * written; {@code speed} (along the facing, negative in reverse) and {@code steering} (-1 left to 1 right) are only
     * written, for the dashboard and the renderer. {@code throttle} is the plane's lever (0 to 1) for {@code air}, and
     * the engine's effort (-1 to 1) for the others.
     */
    public record State(double vx, double vy, double vz, double yaw, double pitch, double throttle, double speed, double steering) {
        public static State at(double yaw) {
            return new State(0, 0, 0, yaw, 0, 0, 0, 0);
        }
    }

    /** One tick. */
    public static State step(Constants c, State s, Input in, Env env) {
        boolean wet = env.waterDepth() > 0;
        boolean submerged = wet && (!env.onGround() || env.waterDepth() > WADE_DEPTH);
        return switch (c.mode()) {
            case GROUND -> submerged ? landVehicleInWater(c, s, in, env) : land(c, s, in, env, 1);
            case WATER -> wet ? water(c, s, in, env, 1) : land(c, s, in, env, OUT_OF_ELEMENT);
            case AMPHIBIOUS -> submerged ? water(c, s, in, env, 1) : land(c, s, in, env, 1);
            case AIR -> submerged ? landVehicleInWater(c, s, in, env) : air(c, s, in, env);
            case HOVER -> hover(c, s, in, env);
        };
    }

    /** A ground vehicle or plane in water: floats (driving at a tenth) with {@code floats}, else sinks. */
    private static State landVehicleInWater(Constants c, State s, Input in, Env env) {
        if (c.floats()) {
            return water(c, s, in, env, OUT_OF_ELEMENT);
        }
        double vx = s.vx() * SINK_DRAG;
        double vz = s.vz() * SINK_DRAG;
        double vy = (s.vy() - SINK_GRAVITY) * SINK_DRAG;
        return new State(vx, vy, vz, s.yaw(), s.pitch(), 0, along(vx, vz, s.yaw()), 0);
    }

    /** On land: driving on the ground; no control in the air. */
    private static State land(Constants c, State s, Input in, Env env, double share) {
        double vy = (s.vy() - GRAVITY) * AIR_DRAG;
        if (!env.onGround()) {
            double vx = s.vx() * AIR_DRAG;
            double vz = s.vz() * AIR_DRAG;
            return new State(vx, vy, vz, s.yaw(), 0, 0, along(vx, vz, s.yaw()), 0);
        }
        Planar p = drive(c, s, in, env.engine(), share, c.grip(), GROUND_COAST, 0);
        return new State(p.vx, vy, p.vz, p.yaw, 0, p.throttle, p.speed, p.steering);
    }

    /** On water: driving with drift, floating at the waterline. */
    private static State water(Constants c, State s, Input in, Env env, double share) {
        Planar p = drive(c, s, in, env.engine(), share, WATER_GRIP, WATER_COAST, WATER_MIN_TURN);
        return new State(p.vx, buoyancy(s.vy(), env.waterDepth()), p.vz, p.yaw, 0, p.throttle, p.speed, p.steering);
    }

    /** The vertical speed of a floating hull whose bottom is {@code depth} below the surface. */
    static double buoyancy(double vy, double depth) {
        double push = clamp((depth - DRAFT) * BUOYANCY, -GRAVITY, MAX_BUOYANCY);
        return (vy + push) * WATER_DAMPING;
    }

    private record Planar(double vx, double vz, double yaw, double speed, double steering, double throttle) {}

    /**
     * Forwards, back and turning on a surface: throttle up to {@code max_speed} (reverse up to its share), back brakes
     * while moving forwards, coasting otherwise; turning scales with speed (reversed in reverse) unless
     * {@code turns_in_place}; {@code grip} turns the velocity towards the new facing.
     */
    private static Planar drive(Constants c, State s, Input in, boolean engine, double share, double grip, double coast, double minTurn) {
        double max = c.maxSpeed() * share;
        double reverseMax = max * c.reverseFactor();
        double acc = c.acceleration() * share;
        double rad = Math.toRadians(s.yaw());
        double fx = -Math.sin(rad);
        double fz = Math.cos(rad);
        double along = s.vx() * fx + s.vz() * fz;
        double latX = s.vx() - fx * along;
        double latZ = s.vz() - fz * along;
        boolean forward = in.forward() && !in.back();
        boolean back = in.back() && !in.forward();
        double speed = along;
        double throttle = 0;
        if (forward && speed < 0) {
            speed = Math.min(0, speed + c.braking());
        } else if (back && speed > 0) {
            speed = Math.max(0, speed - c.braking());
        } else if (forward && engine) {
            throttle = 1;
            speed = speed < max ? Math.min(max, speed + acc) : speed;
        } else if (back && engine) {
            throttle = -1;
            speed = speed > -reverseMax ? Math.max(-reverseMax, speed - acc) : speed;
        } else {
            speed *= coast;
        }
        // Above the top speed (a boat run ashore, a lower share): lose at most the braking per tick.
        if (speed > max) {
            speed = Math.max(max, speed - c.braking());
        } else if (speed < -reverseMax) {
            speed = Math.min(-reverseMax, speed + c.braking());
        }
        if (Math.abs(speed) < STOP) {
            speed = 0;
        }
        double steer = (in.right() ? 1 : 0) - (in.left() ? 1 : 0);
        double moving = Math.min(1, Math.abs(speed) / (max * FULL_TURN_SHARE));
        double factor;
        if (c.turnsInPlace()) {
            factor = engine ? 1 : moving;
        } else {
            factor = Math.max(engine ? minTurn : 0, moving);
            if (speed < 0) {
                factor = -factor;
            }
        }
        double yaw = s.yaw() + steer * c.turnRate() * factor;
        double nrad = Math.toRadians(yaw);
        double nfx = -Math.sin(nrad);
        double nfz = Math.cos(nrad);
        double hx = fx * speed + latX;
        double hz = fz * speed + latZ;
        hx += (nfx * speed - hx) * grip;
        hz += (nfz * speed - hz) * grip;
        return new Planar(hx, hz, yaw, hx * nfx + hz * nfz, steer, throttle);
    }

    /**
     * A plane: forwards and back move the throttle lever; the airspeed follows lever times top speed (gaining
     * {@code acceleration}, losing {@code braking} per tick); the nose follows the driver's view at {@code turn_rate};
     * below {@code takeoff_speed} it sinks. On the ground it rolls without turning in place and lifts its nose only from
     * {@code takeoff_speed} on.
     */
    private static State air(Constants c, State s, Input in, Env env) {
        double[] oldDir = direction(s.yaw(), s.pitch());
        double airspeed = Math.max(0, s.vx() * oldDir[0] + s.vy() * oldDir[1] + s.vz() * oldDir[2]);
        double sinkOld = s.vy() - oldDir[1] * airspeed;
        double lever = s.throttle();
        if (in.forward() && !in.back()) {
            lever = Math.min(1, lever + THROTTLE_STEP);
        } else if (in.back() && !in.forward()) {
            lever = Math.max(0, lever - THROTTLE_STEP);
        }
        double target = env.engine() ? lever * c.maxSpeed() : 0;
        airspeed = airspeed < target ? Math.min(target, airspeed + c.acceleration()) : Math.max(target, airspeed - c.braking());
        if (airspeed < STOP) {
            airspeed = 0;
        }
        double yaw;
        double pitch;
        double vx;
        double vy;
        double vz;
        if (env.onGround()) {
            double moving = Math.min(1, airspeed / (c.maxSpeed() * FULL_TURN_SHARE));
            yaw = approach(s.yaw(), in.viewYaw(), c.turnRate() * moving);
            double pitchTarget = airspeed >= c.takeoffSpeed() ? clamp(in.viewPitch(), -MAX_PITCH, 0) : 0;
            pitch = approach(s.pitch(), pitchTarget, c.turnRate());
            double[] dir = direction(yaw, pitch);
            vx = dir[0] * airspeed;
            vy = dir[1] * airspeed - GRAVITY;
            vz = dir[2] * airspeed;
        } else {
            yaw = approach(s.yaw(), in.viewYaw(), c.turnRate());
            pitch = approach(s.pitch(), clamp(in.viewPitch(), -MAX_PITCH, MAX_PITCH), c.turnRate());
            double lift = c.takeoffSpeed() <= 0 ? 1 : Math.min(1, airspeed / c.takeoffSpeed());
            double sink = lift >= 1 ? sinkOld * STALL_RECOVERY : (sinkOld - GRAVITY * (1 - lift)) * AIR_DRAG;
            double[] dir = direction(yaw, pitch);
            vx = dir[0] * airspeed;
            vy = dir[1] * airspeed + sink;
            vz = dir[2] * airspeed;
        }
        double steering = clamp((yaw - s.yaw()) / c.turnRate(), -1, 1);
        return new State(vx, vy, vz, yaw, pitch, lever, airspeed, steering);
    }

    /**
     * A hovering vehicle: with the engine on it faces the driver's view yaw (at {@code turn_rate}), forwards, back, left
     * and right move it relative to that facing at up to {@code max_speed} (back at its reverse share), jump climbs and
     * descend sinks at {@code lift_speed}, and with neither it holds its height; every change is at most
     * {@code acceleration} per tick. Without the engine it drifts to a stop and sinks slowly; in water it floats.
     */
    private static State hover(Constants c, State s, Input in, Env env) {
        double yaw = s.yaw();
        double vx;
        double vy;
        double vz;
        double steering = 0;
        double throttle = 0;
        if (env.engine()) {
            yaw = approach(s.yaw(), in.viewYaw(), c.turnRate());
            double rad = Math.toRadians(yaw);
            double fx = -Math.sin(rad);
            double fz = Math.cos(rad);
            double rx = -Math.cos(rad);
            double rz = -Math.sin(rad);
            int forward = (in.forward() ? 1 : 0) - (in.back() ? 1 : 0);
            int strafe = (in.right() ? 1 : 0) - (in.left() ? 1 : 0);
            double ahead = forward < 0 ? -c.maxSpeed() * c.reverseFactor() : forward * c.maxSpeed();
            double dx = fx * ahead + rx * strafe * c.maxSpeed();
            double dz = fz * ahead + rz * strafe * c.maxSpeed();
            double length = Math.hypot(dx, dz);
            if (length > c.maxSpeed()) {
                dx *= c.maxSpeed() / length;
                dz *= c.maxSpeed() / length;
            }
            double ex = dx - s.vx();
            double ez = dz - s.vz();
            double gap = Math.hypot(ex, ez);
            if (gap <= c.acceleration()) {
                vx = dx;
                vz = dz;
            } else {
                vx = s.vx() + ex / gap * c.acceleration();
                vz = s.vz() + ez / gap * c.acceleration();
            }
            boolean up = in.up() && !in.down();
            boolean down = in.down() && !in.up();
            double climb = up ? c.liftSpeed() : down ? -c.liftSpeed() : 0;
            vy = towards(s.vy(), climb, c.acceleration());
            steering = strafe;
            throttle = 1;
        } else {
            vx = s.vx() * HOVER_COAST;
            vz = s.vz() * HOVER_COAST;
            vy = towards(s.vy(), -HOVER_SINK, HOVER_SINK_STEP);
        }
        if (env.waterDepth() > DRAFT) {
            vy = Math.max(vy, buoyancy(s.vy(), env.waterDepth()));
        }
        return new State(vx, vy, vz, yaw, 0, throttle, along(vx, vz, yaw), steering);
    }

    /** The unit vector a nose at {@code yaw} and {@code pitch} points along. */
    static double[] direction(double yaw, double pitch) {
        double y = Math.toRadians(yaw);
        double p = Math.toRadians(pitch);
        return new double[] {-Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)};
    }

    /** The horizontal speed along the facing {@code yaw}. */
    static double along(double vx, double vz, double yaw) {
        double rad = Math.toRadians(yaw);
        return -Math.sin(rad) * vx + Math.cos(rad) * vz;
    }

    /** {@code angle} turned towards {@code target} by at most {@code step} degrees, the short way round. */
    static double approach(double angle, double target, double step) {
        double delta = wrapDegrees(target - angle);
        return angle + clamp(delta, -step, step);
    }

    /** {@code value} moved towards {@code target} by at most {@code step} (not an angle). */
    static double towards(double value, double target, double step) {
        return value + clamp(target - value, -step, step);
    }

    /** An angle in degrees brought into [-180, 180). */
    static double wrapDegrees(double degrees) {
        double d = degrees % 360;
        if (d >= 180) {
            d -= 360;
        }
        if (d < -180) {
            d += 360;
        }
        return d;
    }

    static double clamp(double value, double min, double max) {
        return value < min ? min : Math.min(value, max);
    }
}
