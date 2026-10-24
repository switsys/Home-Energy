package se.lierikes.homeenergy.mobile;

import androidx.activity.ComponentActivity;
import java.util.Collections;

/** Public CI/test APK: working dashboard, without Google's separately licensed SDK. */
public final class HomeIntegrationImpl implements HomeIntegration {
    public HomeIntegrationImpl(ComponentActivity activity) {}
    @Override public boolean isSupported() { return false; }
    @Override public void requestPermission(Callback callback) {
        callback.complete("Google Home is not included in this test build.", Collections.emptyList());
    }
    @Override public void readDevices(Callback callback) {
        callback.complete("Install the Google Home-enabled build to discover devices.", Collections.emptyList());
    }
}
