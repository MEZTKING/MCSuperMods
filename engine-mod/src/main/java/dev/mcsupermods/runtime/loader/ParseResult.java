package dev.mcsupermods.runtime.loader;

import java.util.List;
import java.util.Optional;

/**
 * The outcome of parsing one definition file.
 *
 * @param definition present when the file can be registered (possibly with dropped events)
 * @param errors     problems; non-empty means the file does not conform to MSM mcdoc
 * @param warnings   ignored content, such as unknown top-level keys
 */
public record ParseResult<T>(Optional<T> definition, List<String> errors, List<String> warnings) {
    public boolean clean() {
        return errors.isEmpty();
    }
}
