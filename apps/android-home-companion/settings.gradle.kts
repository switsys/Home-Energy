pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        // The licensed Google Home APIs SDK is a separate developer download.
        // Keep its extracted Maven repository outside Git and GitHub Actions.
        val sdkRepository = System.getenv("HOME_ENERGY_HOME_SDK_MAVEN")
            ?.takeIf { it.isNotBlank() }
            ?: System.getProperty("user.home") + "/.local/share/home-energy/google-home-maven"
        maven {
            url = uri(sdkRepository)
            content {
                includeModule("com.google.android.gms", "play-services-home")
                includeModule("com.google.android.gms", "play-services-home-types")
            }
        }
        google()
        mavenCentral()
    }
}
rootProject.name = "HomeEnergyCompanion"
include(":app")
