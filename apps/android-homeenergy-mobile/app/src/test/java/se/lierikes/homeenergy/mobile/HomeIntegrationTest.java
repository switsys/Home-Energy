package se.lierikes.homeenergy.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class HomeIntegrationTest {
    @Test public void poweredDeviceMustBeOnlineAndCommandCapable() {
        HomeIntegration.Device on = new HomeIntegration.Device(
            "home:plug-1", "Vplug1", "Office", "Fan", true, true, true);
        assertTrue(on.isControllable());

        HomeIntegration.Device offline = new HomeIntegration.Device(
            "home:plug-1", "Vplug1", "Office", "Fan", false, true, true);
        assertFalse(offline.isControllable());

        HomeIntegration.Device unsupported = new HomeIntegration.Device(
            "home:plug-2", "Plug", "Office", "Other", true, null, false);
        assertFalse(unsupported.isControllable());
    }

    @Test public void commandNeedsNonemptyQualifiedId() {
        assertFalse(new HomeIntegration.Device(
            "", "Plug", "Office", "Other", true, false, true).isControllable());
        assertFalse(new HomeIntegration.Device(
            null, "Plug", "Office", "Other", true, false, true).isControllable());
    }
}
