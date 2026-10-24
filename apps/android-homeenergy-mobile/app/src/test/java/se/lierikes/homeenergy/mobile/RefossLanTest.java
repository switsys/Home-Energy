package se.lierikes.homeenergy.mobile;

import static org.junit.Assert.*;
import org.junit.Test;

/** Pure local-unit checks; no plugs or credentials are contacted. */
public final class RefossLanTest {
    @Test public void allowsOnlyPrivateIpv4() {
        assertTrue(RefossLan.privateIpv4("192.168.1.10"));
        assertTrue(RefossLan.privateIpv4("10.0.0.42"));
        assertTrue(RefossLan.privateIpv4("172.20.12.4"));
        assertFalse(RefossLan.privateIpv4("172.32.0.4"));
        assertFalse(RefossLan.privateIpv4("8.8.8.8"));
        assertFalse(RefossLan.privateIpv4("127.0.0.1"));
        assertFalse(RefossLan.privateIpv4("169.254.169.254"));
        assertFalse(RefossLan.privateIpv4("192.168.1.1:80"));
        assertFalse(RefossLan.privateIpv4("http://192.168.1.1"));
        assertFalse(RefossLan.privateIpv4("192.168.1.256"));
        assertFalse(RefossLan.privateIpv4("192.168.1.1/config"));
        assertFalse(RefossLan.privateIpv4(null));
    }

    @Test public void merossSignatureIsKeyAndTimestampSpecific() throws Exception {
        String id = "00112233445566778899aabbccddeeff";
        String signature = RefossLan.sign(id, "test-local-key", 1710000000L);
        assertEquals(32, signature.length());
        assertTrue(signature.matches("[0-9a-f]{32}"));
        assertEquals(signature, RefossLan.sign(id, "test-local-key", 1710000000L));
        assertNotEquals(signature, RefossLan.sign(id, "different-key", 1710000000L));
        assertNotEquals(signature, RefossLan.sign(id, "test-local-key", 1710000001L));
    }
}
