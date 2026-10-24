package se.lierikes.homeenergy.mobile;

import java.util.List;

/**
 * Google Home is an opt-in Android capability, not a second installed app.
 * The normal dashboard works even when Google OAuth is unavailable.
 */
public interface HomeIntegration {
    final class Device {
        public final String id;
        public final String name;
        public final String room;
        public final String type;
        public final boolean online;
        public final Boolean isOn;
        public final boolean supportsOnOff;

        public Device(String id, String name, String room, String type,
                      boolean online, Boolean isOn, boolean supportsOnOff) {
            this.id = id;
            this.name = name;
            this.room = room;
            this.type = type;
            this.online = online;
            this.isOn = isOn;
            this.supportsOnOff = supportsOnOff;
        }

        /** Never allow commands on devices offline or without both power commands. */
        public boolean isControllable() {
            return online && supportsOnOff && id != null && !id.isEmpty();
        }
    }
    interface Callback {
        void complete(String message, List<Device> devices);
    }
    boolean isSupported();
    void requestPermission(Callback callback);
    void readDevices(Callback callback);

    /** Explicit user-initiated on/off; no background device changes. */
    void setDevicePower(String qualifiedDeviceId, boolean turnOn, Callback callback);
}
