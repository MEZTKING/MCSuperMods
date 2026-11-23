package dev.mcsupermods.runtime.client.dev;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.mcsupermods.runtime.client.dev.DevClientFiles.Action;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.DevRequest;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.GameState;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.Handled;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.PlayRequest;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.Status;
import java.util.Optional;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameType;
import org.junit.jupiter.api.Test;

/** {@code play.json}, {@code request.json} and {@code status.json} as B366's {@code dev-session.ts} writes and reads them. */
class DevClientFilesTest {
    private static final String PLAY = "{\n  \"format\": 1,\n  \"seq\": 4,\n  \"world\": \"msm-test-ruby\"\n}\n";
    private static final String REQUEST = "{\n  \"action\": \"reload\",\n  \"assets\": true,\n  \"changes\": 3,\n  \"format\": 1,\n  \"seq\": 7\n}\n";

    @Test
    void playRequestAsTheAppWritesIt() {
        assertEquals(Optional.of(new PlayRequest(4, "msm-test-ruby")), DevClientFiles.parsePlayRequest(PLAY));
    }

    @Test
    void invalidPlayRequestsAreEmpty() {
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(null));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest("{"));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(PLAY.replace("\"format\": 1", "\"format\": 2")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(PLAY.replace("\"seq\": 4", "\"seq\": 0")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(PLAY.replace("\"seq\": 4", "\"seq\": 1.5")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(PLAY.replace("\"seq\": 4", "\"seq\": \"4\"")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(PLAY.replace("msm-test-ruby", "../ruby")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(PLAY.replace("msm-test-ruby", "a/b")));
    }

    private static final String GAME_PLAY = "{\n  \"difficulty\": \"hard\",\n  \"format\": 1,\n  \"gameMode\": \"adventure\",\n"
            + "  \"kind\": \"game\",\n  \"preset\": \"ruby:sky_block\",\n  \"seq\": 5,\n  \"world\": \"msm-game-ruby\"\n}\n";

    @Test
    void gamePlayRequestAsTheAppWritesIt() {
        assertEquals(Optional.of(new PlayRequest(5, "msm-game-ruby",
                new DevWorldSettings.GameWorld("ruby:sky_block", GameType.ADVENTURE, Difficulty.HARD))),
                DevClientFiles.parsePlayRequest(GAME_PLAY));
        assertEquals(Optional.of(new PlayRequest(4, "msm-test-ruby")),
                DevClientFiles.parsePlayRequest(PLAY.replace("\"seq\"", "\"kind\": \"test\",\n  \"seq\"")));
    }

    @Test
    void invalidGamePlayRequestsAreEmpty() {
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(GAME_PLAY.replace("\"game\"", "\"other\"")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(GAME_PLAY.replace("\"kind\": \"game\"", "\"kind\": 1")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(GAME_PLAY.replace("adventure", "hardcore")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(GAME_PLAY.replace("\"hard\"", "\"extreme\"")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(GAME_PLAY.replace("ruby:sky_block", "sky_block")));
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(GAME_PLAY.replace("  \"preset\": \"ruby:sky_block\",\n", "")));
        // A game is only ever made in msm-game-<ns>.
        assertEquals(Optional.empty(), DevClientFiles.parsePlayRequest(GAME_PLAY.replace("msm-game-ruby", "msm-test-ruby")));
    }

    @Test
    void statusTextWithASeed() {
        String text = DevClientFiles.statusText(new Status(GameState.WORLD, "msm-game-ruby", null, 5, "1.8.0", "-4172144997902289642"));
        assertEquals("{\n  \"format\": 1,\n  \"handled\": null,\n  \"runtime\": \"1.8.0\",\n  \"seed\": \"-4172144997902289642\",\n"
                + "  \"state\": \"world\",\n  \"time\": 5,\n  \"world\": \"msm-game-ruby\"\n}\n", text);
    }

    @Test
    void requestsAsTheAppWritesThem() {
        assertEquals(Optional.of(new DevRequest(7, Action.RELOAD, true, 3)), DevClientFiles.parseRequest(REQUEST));
        assertEquals(Optional.of(new DevRequest(7, Action.REOPEN, true, 3)),
                DevClientFiles.parseRequest(REQUEST.replace("reload", "reopen")));
        assertEquals(Optional.of(new DevRequest(7, Action.QUIT, false, 0)),
                DevClientFiles.parseRequest(REQUEST.replace("reload", "quit").replace("true", "false").replace("3", "0")));
    }

    @Test
    void invalidRequestsAreEmpty() {
        assertEquals(Optional.empty(), DevClientFiles.parseRequest(null));
        assertEquals(Optional.empty(), DevClientFiles.parseRequest("[]"));
        assertEquals(Optional.empty(), DevClientFiles.parseRequest(REQUEST.replace("reload", "restart")));
        assertEquals(Optional.empty(), DevClientFiles.parseRequest(REQUEST.replace("true", "1")));
        assertEquals(Optional.empty(), DevClientFiles.parseRequest(REQUEST.replace("\"changes\": 3", "\"changes\": -1")));
        assertEquals(Optional.empty(), DevClientFiles.parseRequest(REQUEST.replace("\"changes\": 3", "\"changes\": 2.5")));
        assertEquals(Optional.empty(), DevClientFiles.parseRequest(REQUEST.replace("  \"format\": 1,\n", "")));
        assertEquals(Optional.empty(), DevClientFiles.parseRequest(REQUEST.replace("\"seq\": 7", "\"seq\": -7")));
    }

    @Test
    void statusTextIsSortedAndIndentedAsTheApp() {
        String text = DevClientFiles.statusText(new Status(GameState.WORLD, "msm-test-ruby", new Handled(7, true, null),
                1_763_000_000_000L, "1.8.0"));
        assertEquals("{\n  \"format\": 1,\n  \"handled\": {\n    \"ok\": true,\n    \"seq\": 7\n  },\n  \"runtime\": \"1.8.0\",\n"
                + "  \"state\": \"world\",\n  \"time\": 1763000000000,\n  \"world\": \"msm-test-ruby\"\n}\n", text);
    }

    @Test
    void statusTextWithNullsAndAMessage() {
        assertEquals("{\n  \"format\": 1,\n  \"handled\": null,\n  \"runtime\": \"1.8.0\",\n  \"state\": \"title\",\n"
                + "  \"time\": 5,\n  \"world\": null\n}\n",
                DevClientFiles.statusText(new Status(GameState.TITLE, null, null, 5, "1.8.0")));
        String failed = DevClientFiles.statusText(new Status(GameState.LOADING, null,
                new Handled(2, false, "The test world is not open, so nothing was reloaded."), 5, "1.8.0"));
        assertEquals("{\n  \"format\": 1,\n  \"handled\": {\n    \"message\": \"The test world is not open, so nothing was reloaded.\",\n"
                + "    \"ok\": false,\n    \"seq\": 2\n  },\n  \"runtime\": \"1.8.0\",\n  \"state\": \"loading\",\n  \"time\": 5,\n"
                + "  \"world\": null\n}\n", failed);
    }

    @Test
    void previousHandledRoundTrips() {
        Handled handled = new Handled(9, false, "x <y> & 'z'");
        String text = DevClientFiles.statusText(new Status(GameState.WORLD, "w", handled, 1, "r"));
        assertEquals(Optional.of(handled), DevClientFiles.previousHandled(text));
        assertEquals(Optional.empty(), DevClientFiles.previousHandled(null));
        assertEquals(Optional.empty(), DevClientFiles.previousHandled(
                DevClientFiles.statusText(new Status(GameState.TITLE, null, null, 1, "r"))));
        assertEquals(Optional.empty(), DevClientFiles.previousHandled("{\"format\":1,\"handled\":{\"seq\":3}}"));
    }

    @Test
    void chatLines() {
        assertEquals("MCSuperMods: reloaded (3 changes)", DevClientFiles.chatLine(Action.RELOAD, 3));
        assertEquals("MCSuperMods: reloaded (1 change)", DevClientFiles.chatLine(Action.RELOAD, 1));
        assertEquals("MCSuperMods: reloaded (0 changes)", DevClientFiles.chatLine(Action.RELOAD, 0));
        assertEquals("MCSuperMods: reopened the test world (2 changes)", DevClientFiles.chatLine(Action.REOPEN, 2));
        assertEquals("MCSuperMods: reopened your game (1 change)", DevClientFiles.chatLine(Action.REOPEN, 1, true));
        assertEquals("MCSuperMods: reloaded (2 changes)", DevClientFiles.chatLine(Action.RELOAD, 2, true));
    }
}
