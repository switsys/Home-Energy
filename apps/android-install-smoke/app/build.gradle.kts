plugins {
    id("com.android.application")
}

android {
    namespace = "se.lierikes.homeenergy.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "se.lierikes.homeenergy.companion"
        minSdk = 29
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1-install-test"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Deliberately NO Google Home SDK, AndroidX, network permissions or device controls.
// Verify that Android can install and launch this tiny standalone activity first.
