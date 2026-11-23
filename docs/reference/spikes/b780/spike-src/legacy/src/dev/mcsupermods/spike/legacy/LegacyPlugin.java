package dev.mcsupermods.spike.legacy;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

/** B780 P16 (throwaway): the Bukkit-era route, plugin.yml with a declared command and no bootstrap. */
public class LegacyPlugin extends JavaPlugin {
    @Override
    public void onEnable() {
        getLogger().info("[msm_spike] legacy enabled");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        getLogger().info("[msm_spike] legacy command " + label + " " + String.join(" ", args) + " from " + sender.getName());
        return true;
    }
}
