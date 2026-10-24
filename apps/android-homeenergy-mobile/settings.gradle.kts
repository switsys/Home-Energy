pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        // Restricted developer SDK remains on the private build host only.
        val localHomeSdk = System.getenv("HOME_ENERGY_HOME_SDK_MAVEN")
            ?.takeIf { it.isNotBlank() }
            ?: System.getProperty("user.home") + "/.local/share/home-energy/google-home-maven"
        maven {
            url = uri(localHomeSdk)
            content {
                includeModule("com.google.android.gms", "play-services-home")
                includeModule("com.google.android.gms", "play-services-home-types")
            }
        }
        google()
        mavenCentral()
    }
}

rootProject.name = "HomeEnergyMobile"
include(":app")
