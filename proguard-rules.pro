## --- Expo/React Native/Expo Modules/Firebase 기본 보존 규칙 ---
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.hermes.**
-dontwarn com.facebook.react.**

-keep class expo.modules.** { *; }
-keep class org.unimodules.** { *; }

-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**

## ML Kit / VisionCamera Code Scanner (barcode)
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.internal.mlkit_vision_barcode.**

## VisionCamera / React Native core keep (release 안정성)
-keep class com.mrousavy.camera.** { *; }
-keep class com.facebook.react.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.swmansion.** { *; }
-keepattributes *Annotation*

-keep class com.swmansion.** { *; }         # react-native-gesture-handler 등
-keep class com.squareup.okhttp3.** { *; }
-keep class com.bumptech.glide.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

## Kotlin/반사 사용시 보존
-keep class kotlin.Metadata { *; }
-keepclassmembers class ** {
    @kotlin.Metadata *;
}

## annotation/서명/라인번호(크래시 리포트 가독성 향상)
-keepattributes *Annotation*, InnerClasses, EnclosingMethod, Signature, SourceFile, LineNumberTable

## R8 최적화 보수 설정 (필요시 조정)
-optimizations !code/simplification/arithmetic,!field/*,!class/merging/*
-dontoptimize

## 디버깅 편의를 위해 일부 로그 클래스 보존(필요시 제거 가능)
-keep class com.facebook.common.logging.FLog { *; }

