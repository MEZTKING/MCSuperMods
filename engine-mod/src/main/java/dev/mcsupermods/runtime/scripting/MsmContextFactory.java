package dev.mcsupermods.runtime.scripting;

import org.mozilla.javascript.Context;
import org.mozilla.javascript.ContextFactory;

/**
 * Rhino settings of ADR 0031 D3: ES6 language level, interpreted mode (the instruction observer works only
 * there), an instruction observer every 10,000 instructions, interpreter stack depth 1000, a class shutter
 * that denies every Java class, and a wall-clock budget per top-level call.
 */
public final class MsmContextFactory extends ContextFactory {
    public static final int INSTRUCTION_THRESHOLD = 10_000;
    public static final int MAX_STACK_DEPTH = 1000;
    public static final long DEFAULT_BUDGET_MS = 2000;

    private final long budgetNanos;
    /** Start of the running top-level call, or 0 outside one. Scripts run on the server thread only. */
    private long callStart;

    public MsmContextFactory(long budgetMs) {
        this.budgetNanos = budgetMs * 1_000_000L;
    }

    public long budgetMs() {
        return budgetNanos / 1_000_000L;
    }

    /** Marks the start of a top-level call; the budget is measured from here. */
    void startCall() {
        callStart = System.nanoTime();
    }

    void endCall() {
        callStart = 0;
    }

    @Override
    protected Context makeContext() {
        Context cx = super.makeContext();
        cx.setLanguageVersion(Context.VERSION_ES6);
        cx.setInterpretedMode(true);
        cx.setInstructionObserverThreshold(INSTRUCTION_THRESHOLD);
        cx.setMaximumInterpreterStackDepth(MAX_STACK_DEPTH);
        cx.setClassShutter(name -> false);
        return cx;
    }

    @Override
    protected void observeInstructionCount(Context cx, int instructionCount) {
        long start = callStart;
        if (start != 0 && System.nanoTime() - start > budgetNanos) {
            throw new ScriptTimeout("ran for more than " + budgetMs() + " ms and was stopped");
        }
    }
}
