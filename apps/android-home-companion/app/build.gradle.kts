plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "se.lierikes.homeenergy.companion"
    compileSdk = 36
    defaultConfig {
        applicationId = "se.lierikes.homeenergy.companion"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
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
dependencies {
    implementation("androidx.activity:activity-ktx:1.12.4")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("com.google.android.gms:play-services-home:17.1.0")
    implementation("com.google.android.gms:play-services-home-types:17.1.0")
}
