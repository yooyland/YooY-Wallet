# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.swmansion.worklets.** { *; }
-dontwarn com.swmansion.worklets.**

# Add any project specific keep options here:

# React Native / Hermes / Fresco / Yoga
-keepattributes *Annotation*,Exceptions,InnerClasses,Signature,SourceFile,LineNumberTable
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.react.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.yoga.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.common.internal.DoNotStrip { *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-dontwarn com.facebook.infer.annotation.**

# Expo modules (unimodules v3+ namespace)
-keep class expo.modules.** { *; }

# Gesture Handler / Screens / SVG / WebView (common RN libs)
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.reactnativecommunity.webview.** { *; }

# ML Kit Barcode Scanning (keep ML Kit and wrapper classes to avoid stripping)
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.** { *; }
-keep class com.rnmlkit.barcodescanning.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.**

# RNBlobUtil (react-native-blob-util) - keep native classes from being stripped
-keep class com.ReactNativeBlobUtil.** { *; }
-dontwarn com.ReactNativeBlobUtil.**
# legacy package (older forks)
-keep class com.RNFetchBlob.** { *; }
-dontwarn com.RNFetchBlob.**
