plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "se.lierikes.homeenergy.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "se.lierikes.homeenergy.mobile"
        minSdk = 29
        targetSdk = 35
        versionCode = 8
        versionName = "0.7.0"
    }
    flavorDimensions += "integration"
    productFlavors {
        create("standard") { dimension = "integration" }
        create("googleHome") { dimension = "integration" }
    }
    // Offline private Android SDK lacks lint-gradle; regular CI tests still run.
    lint {
        checkReleaseBuilds = false
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        jvmToolchain(21)
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
}

// Both variants have the same application ID: one app icon, never two installs.
// CI builds the standard fallback; the private build host adds Google's licensed SDK.
dependencies {
    implementation("androidx.activity:activity-ktx:1.12.4")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    add("googleHomeImplementation", "com.google.android.gms:play-services-home:17.1.0")
    add("googleHomeImplementation", "com.google.android.gms:play-services-home-types:17.1.0")
    testImplementation("junit:junit:4.13.2")
}
