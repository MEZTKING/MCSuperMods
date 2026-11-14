package dev.mcsupermods.runtime.registry.machine;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.components.BlockComponents.MachinePower;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.container.MsmContainerBlock;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.NonNullList;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.Containers;
import net.minecraft.world.WorldlyContainer;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CookingFuel;
import net.minecraft.world.item.crafting.RecipeManager;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BaseContainerBlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.level.storage.loot.providers.number.floats.ResolvableFloat;
import net.minecraft.world.level.storage.loot.providers.number.ints.ResolvableInt;
import net.minecraft.world.phys.Vec3;

/**
 * The block entity of an {@code msm:machine} block (ADR 0075 D3): three slots (input 0, fuel 1, output 2) in
 * {@link ContainerHelper}'s {@code Items} shape, a server-only ticker ({@link #serverTick}), the furnace's four menu
 * values ({@link MachineData}) and a vanilla furnace, blast furnace or smoker screen ({@link MsmFurnaceMenu}). Written for
 * MSM after the furnace's rules; it does not extend {@code AbstractFurnaceBlockEntity}.
 *
 * <ul>
 *   <li>Recipes: the machine's {@code recipe_types} in order ({@link MachineRecipes#lookups}); a lookup runs only when
 *       the input stack (item, components or count) or the server's recipe manager (a {@code /reload}) changed, through
 *       vanilla's cached check.
 *   <li>Power: {@code fuel} burns {@code minecraft:cooking_fuel} items as a furnace (burn time and the fuel's speed
 *       multiplier); {@code redstone} works while {@code level.hasNeighborSignal(pos)}; {@code always} whenever it has a
 *       matching input. A recipe takes {@code ceil(time / (speed x fuel speed))} ticks; progress cools down by 2 a tick
 *       while unpowered, as a furnace's.
 *   <li>Output waits when it does not fit. Each output stores its experience (saved), {@code on_finish} fires once per
 *       output and {@code on_start} when a recipe starts, at the block with no actor.
 *   <li>{@code lit} (fuel: burning; otherwise: working) is set only when it changes; the light follows it
 *       ({@code lit_light}, set up by {@code MsmContainerBlock}).
 *   <li>Hoppers (D5): the top reaches the input, the sides the fuel (only with {@code power: fuel}), the bottom the
 *       output and an empty bucket in the fuel slot; none with {@code hoppers: false}.
 *   <li>Experience (D6) is paid to a player taking from the menu's output slot ({@link MsmMachineResultSlot}) or dropped
 *       as orbs when the block is removed, with the contents.
 * </ul>
 */
public class MsmMachineBlockEntity extends BaseContainerBlockEntity implements WorldlyContainer {
    public static final int INPUT = 0;
    public static final int FUEL = 1;
    public static final int OUTPUT = 2;
    private static final int[] SLOTS_UP = {INPUT};
    private static final int[] SLOTS_DOWN = {OUTPUT, FUEL};
    private static final int[] SLOTS_SIDES = {FUEL};
    private static final int[] NO_SLOTS = {};

    private final Identifier machineId;
    private final BlockComponents.Machine spec;
    private final ContainerData data = new MachineData(this);
    private NonNullList<ItemStack> items = NonNullList.withSize(3, ItemStack.EMPTY);
    private int litTime;
    private int litDuration;
    private float fuelSpeed = 1.0f;
    private int progress;
    private int totalTime;
    private float experience;
    private boolean working;
    private int lastSignal;

    // The furnace's lookup rule: only when the input or the recipe manager changed.
    private List<MachineRecipes.Lookup> lookups;
    private RecipeManager lastManager;
    private ItemStack lastInput = ItemStack.EMPTY;
    private Optional<MachineRecipes.Match> current = Optional.empty();

    public MsmMachineBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state, Identifier machineId,
            BlockComponents.Machine spec) {
        super(type, pos, state);
        this.machineId = machineId;
        this.spec = spec;
    }

    /** The machine settings of the block. */
    public BlockComponents.Machine spec() {
        return spec;
    }

    /** Ticks of the current recipe done; 0 while idle. */
    public int progress() {
        return progress;
    }

    /** Ticks the current (or last) recipe takes at this machine's speed. */
    public int totalTime() {
        return totalTime;
    }

    /** Whether the machine advanced a recipe on its last tick. */
    public boolean working() {
        return working;
    }

    /** Fuel ticks left ({@code power: fuel}). */
    public int litTime() {
        return litTime;
    }

    /** Experience stored by outputs not yet paid out. */
    public float storedExperience() {
        return experience;
    }

    int litTimeForMenu() {
        return spec.power() == MachinePower.FUEL ? litTime : working ? 1 : 0;
    }

    int litDurationForMenu() {
        return spec.power() == MachinePower.FUEL ? litDuration : 1;
    }

    // Saving

    @Override
    protected void loadAdditional(ValueInput input) {
        super.loadAdditional(input);
        items = NonNullList.withSize(getContainerSize(), ItemStack.EMPTY);
        ContainerHelper.loadAllItems(input, items);
        litTime = input.getIntOr("lit_time_remaining", 0);
        litDuration = input.getIntOr("lit_total_time", 0);
        fuelSpeed = input.getFloatOr("fuel_speed", 1.0f);
        progress = input.getIntOr("cooking_time_spent", 0);
        totalTime = input.getIntOr("cooking_total_time", 0);
        experience = input.getFloatOr("experience", 0.0f);
        lastManager = null; // look the recipe up again
    }

    @Override
    protected void saveAdditional(ValueOutput output) {
        super.saveAdditional(output);
        ContainerHelper.saveAllItems(output, items);
        output.putInt("lit_time_remaining", litTime);
        output.putInt("lit_total_time", litDuration);
        output.putFloat("fuel_speed", fuelSpeed);
        output.putInt("cooking_time_spent", progress);
        output.putInt("cooking_total_time", totalTime);
        output.putFloat("experience", experience);
    }

    // Container

    @Override
    public int getContainerSize() {
        return 3;
    }

    @Override
    protected NonNullList<ItemStack> getItems() {
        return items;
    }

    @Override
    protected void setItems(NonNullList<ItemStack> items) {
        this.items = items;
    }

    /** A different item in the input slot restarts the recipe, as in a furnace. */
    @Override
    public void setItem(int slot, ItemStack stack) {
        boolean sameInput = slot == INPUT && !stack.isEmpty() && ItemStack.isSameItemSameComponents(items.get(INPUT), stack);
        super.setItem(slot, stack);
        if (slot == INPUT && !sameInput && progress != 0) {
            progress = 0;
            setChanged();
        }
    }

    @Override
    protected Component getDefaultName() {
        return Component.translatable(getBlockState().getBlock().getDescriptionId());
    }

    @Override
    protected AbstractContainerMenu createMenu(int containerId, Inventory inventory) {
        return MsmFurnaceMenu.create(spec.menu(machineId), containerId, inventory, this, data);
    }

    /** Whether the fuel slot takes {@code stack}: a {@code cooking_fuel} item, and only with {@code power: fuel}. */
    public boolean isFuel(ItemStack stack) {
        return spec.power() == MachinePower.FUEL && stack.has(DataComponents.COOKING_FUEL);
    }

    /** Whether any recipe of the machine's types takes {@code stack} (shift-click into the input slot); server only. */
    public boolean canProcess(ItemStack stack) {
        if (!(getLevel() instanceof ServerLevel server) || stack.isEmpty()) {
            return false;
        }
        for (MachineRecipes.Lookup lookup : lookups()) {
            if (lookup.accepts(stack, server)) {
                return true;
            }
        }
        return false;
    }

    // Hoppers (D5)

    @Override
    public boolean canPlaceItem(int slot, ItemStack stack) {
        return switch (slot) {
            case OUTPUT -> false;
            case FUEL -> spec.power() == MachinePower.FUEL
                    && (isFuel(stack) || stack.is(Items.BUCKET) && !items.get(FUEL).is(Items.BUCKET));
            default -> true;
        };
    }

    @Override
    public int[] getSlotsForFace(Direction side) {
        if (!spec.hoppers()) {
            return NO_SLOTS;
        }
        return switch (side) {
            case UP -> SLOTS_UP;
            case DOWN -> SLOTS_DOWN;
            default -> spec.power() == MachinePower.FUEL ? SLOTS_SIDES : NO_SLOTS;
        };
    }

    @Override
    public boolean canPlaceItemThroughFace(int slot, ItemStack stack, Direction side) {
        return spec.hoppers() && canPlaceItem(slot, stack);
    }

    @Override
    public boolean canTakeItemThroughFace(int slot, ItemStack stack, Direction side) {
        if (!spec.hoppers()) {
            return false;
        }
        return side != Direction.DOWN || slot != FUEL || stack.is(Items.WATER_BUCKET) || stack.is(Items.BUCKET);
    }

    // Comparators (D5)

    /** The comparator signal of {@code comparator}: the container formula, the progress in fifteenths, or 0. */
    public int comparatorSignal() {
        return switch (spec.comparator()) {
            case CONTENTS -> AbstractContainerMenu.getRedstoneSignalFromContainer(this);
            case PROGRESS -> working && totalTime > 0 ? Mth.ceil(15.0f * progress / totalTime) : 0;
            case NONE -> 0;
        };
    }

    // Experience (D6)

    /** Pays the stored experience to {@code player} as orbs at the player. */
    public void payExperience(ServerPlayer player) {
        if (getLevel() instanceof ServerLevel server) {
            int amount = takeExperience(server.getRandom());
            if (amount > 0) {
                ExperienceOrb.award(server, player.position(), amount);
            }
        }
    }

    /** The whole points of the stored experience, the fraction as a chance of one more, as a furnace pays it. */
    private int takeExperience(RandomSource random) {
        float total = experience;
        if (total <= 0) {
            return 0;
        }
        experience = 0;
        setChanged();
        int whole = Mth.floor(total);
        float fraction = Mth.frac(total);
        return fraction != 0 && random.nextFloat() < fraction ? whole + 1 : whole;
    }

    /** Drops the contents (vanilla's {@code Container} rule) and the stored experience as orbs at the block. */
    @Override
    public void preRemoveSideEffects(BlockPos pos, BlockState state) {
        super.preRemoveSideEffects(pos, state);
        if (getLevel() instanceof ServerLevel server) {
            int amount = takeExperience(server.getRandom());
            if (amount > 0) {
                ExperienceOrb.award(server, Vec3.atCenterOf(pos), amount);
            }
        }
    }

    // The ticker (D3)

    private List<MachineRecipes.Lookup> lookups() {
        if (lookups == null) {
            lookups = MachineRecipes.lookups(machineId, spec.recipeTypes(machineId));
        }
        return lookups;
    }

    /** The recipe for the input slot, looked up only when the input or the recipe manager changed. */
    private Optional<MachineRecipes.Match> match(ServerLevel level) {
        ItemStack input = items.get(INPUT);
        RecipeManager manager = level.recipeAccess();
        if (manager != lastManager || !ItemStack.matches(input, lastInput)) {
            lastManager = manager;
            lastInput = input.copy();
            current = Optional.empty();
            if (!input.isEmpty()) {
                for (MachineRecipes.Lookup lookup : lookups()) {
                    current = lookup.find(input, level);
                    if (current.isPresent()) {
                        break;
                    }
                }
            }
        }
        return current;
    }

    /** Whether {@code result} fits into the output slot. */
    private boolean fits(ItemStack result) {
        if (result.isEmpty()) {
            return false;
        }
        ItemStack out = items.get(OUTPUT);
        if (out.isEmpty()) {
            return true;
        }
        return ItemStack.isSameItemSameComponents(out, result)
                && out.getCount() + result.getCount() <= Math.min(getMaxStackSize(), out.getMaxStackSize());
    }

    /** Ticks {@code match} takes here: its time (or {@code default_time}) over the machine's and the fuel's speed. */
    private int totalFor(MachineRecipes.Match match) {
        int time = match.time().orElse(spec.defaultTime());
        float factor = spec.speed() * (spec.power() == MachinePower.FUEL ? fuelSpeed : 1.0f);
        return Math.max(1, Mth.ceil(time / factor));
    }

    /** Burns one fuel item: true when the fuel slot held a fuel. Its crafting remainder replaces it or is dropped. */
    private boolean burnFuel(ServerLevel level, BlockPos pos) {
        ItemStack fuel = items.get(FUEL);
        if (fuel.isEmpty()) {
            return false;
        }
        int burn = ResolvableInt.getFromItem(fuel, DataComponents.COOKING_FUEL, CookingFuel::burnTime, getLootContext(level), 0);
        if (burn <= 0) {
            return false;
        }
        float speed = ResolvableFloat.getFromItem(fuel, DataComponents.COOKING_FUEL, CookingFuel::speedMultiplier,
                getLootContext(level), 1.0f);
        litTime = burn;
        litDuration = burn;
        fuelSpeed = speed > 0 ? speed : 1.0f;
        ItemStackTemplate remainder = fuel.getItem().getCraftingRemainder();
        fuel.shrink(1);
        if (remainder != null) {
            if (fuel.isEmpty()) {
                items.set(FUEL, remainder.create());
            } else {
                Containers.dropItemStack(level, pos.getX(), pos.getY(), pos.getZ(), remainder.create());
            }
        }
        return true;
    }

    /** One server tick of the machine (the block's ticker). */
    public void serverTick(ServerLevel level, BlockPos pos, BlockState state) {
        boolean changed = false;
        if (litTime > 0) {
            litTime--;
        }
        Optional<MachineRecipes.Match> match = match(level);
        boolean canRun = match.isPresent() && fits(match.get().result());
        boolean powered = switch (spec.power()) {
            case FUEL -> {
                if (litTime <= 0 && canRun && burnFuel(level, pos)) {
                    changed = true;
                }
                yield litTime > 0;
            }
            case REDSTONE -> level.hasNeighborSignal(pos);
            case ALWAYS -> true;
        };
        working = powered && canRun;
        if (working) {
            MachineRecipes.Match m = match.get();
            int total = totalFor(m);
            if (total != totalTime) {
                if (progress > 0 && totalTime > 0) {
                    progress = Math.min(total - 1, Mth.ceil((float) progress / totalTime * total)); // a faster fuel keeps the share done
                }
                totalTime = total;
            }
            if (progress == 0) {
                fire(level, pos, spec.onStart());
            }
            progress++;
            if (progress >= totalTime) {
                progress = 0;
                finish(level, pos, m);
                changed = true;
            }
        } else if (!canRun) {
            progress = 0;
        } else if (progress > 0) {
            progress = Math.max(0, progress - 2); // unpowered with a recipe under way: cools down as a furnace
        }
        boolean lit = spec.power() == MachinePower.FUEL ? litTime > 0 : working;
        if (state.hasProperty(MsmBlock.LIT) && state.getValue(MsmBlock.LIT) != lit) {
            state = state.setValue(MsmBlock.LIT, lit);
            level.setBlock(pos, state, Block.UPDATE_ALL);
            changed = true;
        }
        if (changed) {
            setChanged(level, pos, state);
        } else if (spec.comparator() == BlockComponents.MachineComparator.PROGRESS) {
            int signal = comparatorSignal();
            if (signal != lastSignal) {
                level.updateNeighbourForOutputSignal(pos, state.getBlock());
            }
        }
        lastSignal = comparatorSignal();
    }

    /** Moves the result into the output slot, uses the inputs, stores the experience and fires {@code on_finish}. */
    private void finish(ServerLevel level, BlockPos pos, MachineRecipes.Match match) {
        ItemStack result = match.result();
        ItemStack out = items.get(OUTPUT);
        if (out.isEmpty()) {
            items.set(OUTPUT, result.copy());
        } else {
            out.grow(result.getCount());
        }
        items.get(INPUT).shrink(match.count());
        experience += match.experience();
        fire(level, pos, spec.onFinish());
    }

    /** Fires {@code event} at the block with no actor (ADR 0075 D3), as a block's random tick trigger. */
    private void fire(ServerLevel level, BlockPos pos, Optional<Identifier> event) {
        if (event.isPresent() && getBlockState().getBlock() instanceof MsmContainerBlock block) {
            EventRunner.fire(block.id(), block.definition().events(), event.get(), EventContext.forBlock(level, pos, null));
        }
    }
}
