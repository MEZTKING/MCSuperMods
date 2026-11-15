package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closedMap;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.datafixers.util.Either;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import net.minecraft.resources.Identifier;

/**
 * HUD element definition v1 ({@code ::msm::definition::Hud}, ADR 0089 D1, D2), {@code msm/<ns>/hud/<path>.json}: one
 * text, bar or row of icons drawn by the runtime's HUD layer. Closed, as {@code controls.mcdoc} (an unknown key, a value
 * out of range or a colour that is not {@code #rrggbb} is an error and nothing is registered). Fields of another
 * {@code type} than the element's are read and ignored. Pure: no registry is touched, so JUnit runs it over the
 * conformance corpus.
 *
 * @param offsetX      GUI pixels right of the anchor's place (-4096..4096)
 * @param offsetY      GUI pixels below the anchor's place (-4096..4096)
 * @param order        within an anchor, lower first, then by id
 * @param vehicle      with {@code show} {@code in_vehicle} or {@code driving}: only in this vehicle type
 * @param startsHidden hidden until a {@code show_hud} action, a script or a Rules step shows it
 */
public record HudDefinition(
        Type type,
        Anchor anchor,
        int offsetX,
        int offsetY,
        int order,
        HudValue value,
        Max max,
        Show show,
        Optional<Identifier> vehicle,
        boolean startsHidden,
        TextStyle text,
        BarStyle bar,
        IconStyle icons) {
    public static final List<String> KEYS = List.of("format", "type", "anchor", "offset", "order", "value", "max", "show", "vehicle",
            "starts_hidden", "text", "color", "shadow", "size", "fill_color", "back_color", "sprite", "back_sprite", "icon", "half_icon",
            "empty_icon", "per_icon");

    /** {@code max} default: a full bar or row of icons at 20 (as health). */
    public static final float DEFAULT_MAX = 20;
    /** {@code text} default. */
    public static final String DEFAULT_TEXT = "{value}";
    /** {@code color} default, {@code #ffffff}. */
    public static final int DEFAULT_COLOR = 0xffffff;
    /** {@code size} default, a vanilla bar's width: 81 by 5 GUI pixels. */
    public static final int DEFAULT_BAR_WIDTH = 81;
    public static final int DEFAULT_BAR_HEIGHT = 5;
    /** {@code fill_color} default, {@code #e0c040}. */
    public static final int DEFAULT_FILL = 0xe0c040;
    /** {@code back_color} default, {@code #202020}. */
    public static final int DEFAULT_BACK = 0x202020;
    /** {@code per_icon} default, as hearts. */
    public static final float DEFAULT_PER_ICON = 2;
    /** The largest {@code offset} either way. */
    public static final int MAX_OFFSET = 4096;
    /** The largest {@code size} either way. */
    public static final int MAX_SIZE = 512;

    /** {@code HudType}. */
    public enum Type {
        TEXT, BAR, ICONS;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Type> CODEC = MsmCodecs.named("hud type", values(), Type::serialName);
    }

    /** {@code HudAnchor}: where on the screen the element sits (ADR 0089 D4; the rules are {@code HudLayout}'s). */
    public enum Anchor {
        TOP_LEFT, TOP, TOP_RIGHT, LEFT, CENTER, RIGHT, BOTTOM_LEFT, BOTTOM, BOTTOM_RIGHT, ABOVE_HOTBAR;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Anchor> CODEC = MsmCodecs.named("hud anchor", values(), Anchor::serialName);
    }

    /** {@code HudShow}: when the element is drawn, on top of {@code starts_hidden} and the show and hide actions. */
    public enum Show {
        ALWAYS, WHEN_SET, IN_VEHICLE, DRIVING;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        /** Whether {@code vehicle} means anything with this value. */
        public boolean namesVehicle() {
            return this == IN_VEHICLE || this == DRIVING;
        }

        public static final Codec<Show> CODEC = MsmCodecs.named("hud show", values(), Show::serialName);
    }

    /** {@code HudSource}. */
    public enum Source {
        DATA, SCORE, VEHICLE, PLAYER, SET;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        /** Whether the server computes and sends this source's values (ADR 0089 D3): every source but player and set. */
        public boolean computedOnServer() {
            return this == DATA || this == SCORE || this == VEHICLE;
        }

        public static final Codec<Source> CODEC = MsmCodecs.named("hud source", values(), Source::serialName);
    }

    /** {@code HudDataScope}. */
    public enum DataScope {
        PLAYER, WORLD;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<DataScope> CODEC = MsmCodecs.named("data scope", values(), DataScope::serialName);
    }

    /** {@code HudVehicleStat}. */
    public enum VehicleStat {
        FUEL, HEALTH, AMMO, SPEED, RELOAD;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<VehicleStat> CODEC = MsmCodecs.named("vehicle stat", values(), VehicleStat::serialName);
    }

    /** {@code HudPlayerStat}. */
    public enum PlayerStat {
        HEALTH, FOOD, AIR, ARMOR, LEVEL, X, Y, Z;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<PlayerStat> CODEC = MsmCodecs.named("player stat", values(), PlayerStat::serialName);
    }

    /** {@code HudValue} (ADR 0089 D2), selected by {@code source}; each member is closed. */
    public sealed interface HudValue {
        Source source();

        Codec<HudValue> CODEC = Source.CODEC.dispatch("source", HudValue::source, HudValue::codec);

        private static MapCodec<? extends HudValue> codec(Source source) {
            return switch (source) {
                case DATA -> Data.CODEC;
                case SCORE -> Score.CODEC;
                case VEHICLE -> Vehicle.CODEC;
                case PLAYER -> Player.CODEC;
                case SET -> SetOnly.CODEC;
            };
        }
    }

    /** Script data (ADR 0062) under {@code namespace} and {@code key}, the viewer's or the world's. */
    public record Data(DataScope scope, String namespace, String key) implements HudValue {
        static final MapCodec<Data> CODEC = closedMap(RecordCodecBuilder.mapCodec(i -> i.group(
                required("scope", DataScope.CODEC).forGetter(Data::scope),
                required("namespace", Fields.NON_EMPTY).forGetter(Data::namespace),
                required("key", Fields.NON_EMPTY).forGetter(Data::key)).apply(i, Data::new)), List.of("source", "scope", "namespace", "key"));

        @Override
        public Source source() {
            return Source.DATA;
        }
    }

    /** A scoreboard score of {@code objective}, held by the viewer ({@link #SELF}) or a fixed name. */
    public record Score(String objective, String holder) implements HudValue {
        /** {@code holder} default: the viewer. */
        public static final String SELF = "@s";

        static final MapCodec<Score> CODEC = closedMap(RecordCodecBuilder.mapCodec(i -> i.group(
                required("objective", Fields.NON_EMPTY).forGetter(Score::objective),
                optional("holder", Fields.NON_EMPTY, SELF).forGetter(Score::holder)).apply(i, Score::new)), List.of("source", "objective", "holder"));

        @Override
        public Source source() {
            return Source.SCORE;
        }
    }

    /** A stat of the vehicle the viewer rides; {@code weapon} (with ammo and reload) defaults to the first weapon. */
    public record Vehicle(VehicleStat stat, Optional<String> weapon) implements HudValue {
        static final MapCodec<Vehicle> CODEC = closedMap(RecordCodecBuilder.mapCodec(i -> i.group(
                required("stat", VehicleStat.CODEC).forGetter(Vehicle::stat),
                optional("weapon", Fields.NON_EMPTY).forGetter(Vehicle::weapon)).apply(i, Vehicle::new)), List.of("source", "stat", "weapon"));

        @Override
        public Source source() {
            return Source.VEHICLE;
        }
    }

    /** A stat of the viewer, read on the client and never synced. */
    public record Player(PlayerStat stat) implements HudValue {
        static final MapCodec<Player> CODEC = closedMap(RecordCodecBuilder.mapCodec(i -> i.group(
                required("stat", PlayerStat.CODEC).forGetter(Player::stat)).apply(i, Player::new)), List.of("source", "stat"));

        @Override
        public Source source() {
            return Source.PLAYER;
        }
    }

    /** Only what {@code set_hud}, a script or a Rules step sets. */
    public record SetOnly() implements HudValue {
        static final MapCodec<SetOnly> CODEC = closedMap(MapCodec.unit(new SetOnly()), List.of("source"));

        @Override
        public Source source() {
            return Source.SET;
        }
    }

    /** {@code max}: a fixed number or another value. */
    public sealed interface Max {
        Codec<Max> CODEC = Codec.either(floatAtLeast(0), HudValue.CODEC).xmap(
                e -> e.map(Fixed::new, From::new),
                m -> m instanceof Fixed f ? Either.left(f.max()) : Either.right(((From) m).value()));
    }

    /** A fixed {@code max}. */
    public record Fixed(float max) implements Max {}

    /** A {@code max} read from a value; until it has one, {@link #DEFAULT_MAX}. */
    public record From(HudValue value) implements Max {}

    /** {@code text}, {@code color} (RGB) and {@code shadow}: used by {@code text} elements. */
    public record TextStyle(String text, int color, boolean shadow) {
        static final MapCodec<TextStyle> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("text", Codec.STRING, DEFAULT_TEXT).forGetter(TextStyle::text),
                optional("color", Fields.COLOR, DEFAULT_COLOR).forGetter(TextStyle::color),
                optional("shadow", Codec.BOOL, true).forGetter(TextStyle::shadow)).apply(i, TextStyle::new));
    }

    /** {@code size}, {@code fill_color}, {@code back_color} (RGB), {@code sprite}, {@code back_sprite}: used by bars. */
    public record BarStyle(int width, int height, int fillColor, int backColor, Optional<Identifier> sprite, Optional<Identifier> backSprite) {
        static final MapCodec<BarStyle> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("size", listOfLength(intRange(1, MAX_SIZE), 2, 2), List.of(DEFAULT_BAR_WIDTH, DEFAULT_BAR_HEIGHT))
                        .forGetter((BarStyle b) -> List.of(b.width(), b.height())),
                optional("fill_color", Fields.COLOR, DEFAULT_FILL).forGetter(BarStyle::fillColor),
                optional("back_color", Fields.COLOR, DEFAULT_BACK).forGetter(BarStyle::backColor),
                optional("sprite", ID).forGetter(BarStyle::sprite),
                optional("back_sprite", ID).forGetter(BarStyle::backSprite))
                .apply(i, (size, fill, back, sprite, backSprite) -> new BarStyle(size.get(0), size.get(1), fill, back, sprite, backSprite)));
    }

    /** {@code icon}, {@code half_icon}, {@code empty_icon} and {@code per_icon}: used by icon rows. */
    public record IconStyle(Optional<Identifier> icon, Optional<Identifier> halfIcon, Optional<Identifier> emptyIcon, float perIcon) {
        static final MapCodec<IconStyle> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("icon", ID).forGetter(IconStyle::icon),
                optional("half_icon", ID).forGetter(IconStyle::halfIcon),
                optional("empty_icon", ID).forGetter(IconStyle::emptyIcon),
                optional("per_icon", floatAtLeast(0.01f), DEFAULT_PER_ICON).forGetter(IconStyle::perIcon)).apply(i, IconStyle::new));
    }

    /** Shared field codecs, in their own class so that the nested records' initialisers never wait on this one's. */
    static final class Fields {
        private Fields() {}

        /** A non-empty string (mcdoc {@code string @ 1..}). */
        static final Codec<String> NON_EMPTY = Codec.STRING.validate(s -> s.isEmpty()
                ? DataResult.error(() -> "must not be empty")
                : DataResult.success(s));

        private static final Pattern HEX = Pattern.compile("#[0-9a-fA-F]{6}");

        /** A {@code #rrggbb} colour, decoded to its RGB value. */
        static final Codec<Integer> COLOR = Codec.STRING.comapFlatMap(
                s -> HEX.matcher(s).matches()
                        ? DataResult.success(Integer.parseInt(s.substring(1), 16))
                        : DataResult.error(() -> "not a #rrggbb colour: '" + s + "'"),
                rgb -> String.format(Locale.ROOT, "#%06x", rgb));

        static final Codec<List<Integer>> OFFSET = listOfLength(intRange(-MAX_OFFSET, MAX_OFFSET), 2, 2);
    }

    private record Head(Type type, Anchor anchor, List<Integer> offset, int order, HudValue value, Max max, Show show,
            Optional<Identifier> vehicle, boolean startsHidden) {
        static final MapCodec<Head> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("type", Type.CODEC).forGetter(Head::type),
                optional("anchor", Anchor.CODEC, Anchor.ABOVE_HOTBAR).forGetter(Head::anchor),
                optional("offset", Fields.OFFSET, List.of(0, 0)).forGetter(Head::offset),
                optional("order", MsmCodecs.INT, 0).forGetter(Head::order),
                required("value", HudValue.CODEC).forGetter(Head::value),
                optional("max", Max.CODEC, new Fixed(DEFAULT_MAX)).forGetter(Head::max),
                optional("show", Show.CODEC, Show.WHEN_SET).forGetter(Head::show),
                optional("vehicle", ID).forGetter(Head::vehicle),
                optional("starts_hidden", Codec.BOOL, false).forGetter(Head::startsHidden)).apply(i, Head::new));
    }

    public static final Codec<HudDefinition> CODEC = closed(RecordCodecBuilder.<HudDefinition>create(i -> i.group(
            Head.CODEC.forGetter(HudDefinition::head),
            TextStyle.CODEC.forGetter(HudDefinition::text),
            BarStyle.CODEC.forGetter(HudDefinition::bar),
            IconStyle.CODEC.forGetter(HudDefinition::icons)).apply(i, (h, text, bar, icons) -> new HudDefinition(h.type(), h.anchor(),
                    h.offset().get(0), h.offset().get(1), h.order(), h.value(), h.max(), h.show(), h.vehicle(), h.startsHidden(), text, bar,
                    icons))), KEYS);

    private Head head() {
        return new Head(type, anchor, List.of(offsetX, offsetY), order, value, max, show, vehicle, startsHidden);
    }

    /** This definition without {@code vehicle} (ignored with a warning when {@code show} does not name one). */
    public HudDefinition withoutVehicle() {
        return new HudDefinition(type, anchor, offsetX, offsetY, order, value, max, show, Optional.empty(), startsHidden, text, bar, icons);
    }

    /** Whether {@code max} is read from a value the server computes (it then has its own slot in the payload). */
    public boolean maxFromServer() {
        return max instanceof From f && f.value().source().computedOnServer();
    }
}
