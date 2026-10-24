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
        versionCode = 4
        versionName = "0.3.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Single Android app: HTTPS dashboard and read-only local Refoss MSS210 status.
// No Google Home SDK, no Companion dependency and no physical switching.

dependencies {
    testImplementation("junit:junit:4.13.2")
}
