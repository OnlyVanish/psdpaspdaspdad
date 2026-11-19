plugins {
    id("com.android.application")
}

android {
    namespace = "ir.crow.nativegame"
    compileSdk = 36

    defaultConfig {
        applicationId = "ir.crow.nativegame"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = false
    }
}

dependencies {
    implementation("org.mozilla:rhino:1.7.15")
}
