plugins {
    id("com.android.application")
}

android {
    namespace = "se.lierikes.homeenergy.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "se.lierikes.homeenergy.mobile"
        minSdk = 29
        targetSdk = 35
        versionCode = 3
        versionName = "0.2.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Keep this installable, low-risk wrapper independent of the proprietary
// Google Home SDK. Device control remains in the server's approval-gated bridge.
