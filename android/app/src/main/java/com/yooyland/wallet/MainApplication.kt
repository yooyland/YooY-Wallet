package com.yooyland.wallet

import android.app.Application
import android.content.res.Configuration
import android.util.Log

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
// Reanimated: RN 0.7x에서는 별도 JSIModulePackage 등록이 필요하지 않습니다.

import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED

          // Reanimated JSI is auto-registered by the library and build plugin.
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()

    // Firebase AppCheck: Android 네이티브 SDK에서 먼저 초기화 (Play Integrity / Debug)
    try {
      // 이미 초기화된 FirebaseApp 이 있으면 재사용, 없으면 google-services.json 기반으로 초기화
      val firebaseApp = if (FirebaseApp.getApps(this).isEmpty()) {
        FirebaseApp.initializeApp(this)
      } else {
        FirebaseApp.getInstance()
      }

      if (firebaseApp != null) {
        val appCheck = FirebaseAppCheck.getInstance(firebaseApp)
        if (BuildConfig.DEBUG) {
          // 디버그/개발 빌드: Debug provider 사용 (콘솔에 출력되는 토큰을 Firebase 콘솔에 등록)
          appCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance())
          Log.i("AppCheck", "Installed DebugAppCheckProviderFactory (debug/dev build)")
        } else {
          // 릴리스 빌드: Play Integrity provider 사용
          appCheck.installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance())
          Log.i("AppCheck", "Installed PlayIntegrityAppCheckProviderFactory (release build)")
        }
      } else {
        Log.w("AppCheck", "FirebaseApp.initializeApp returned null; App Check not installed")
      }
    } catch (e: Exception) {
      // App Check 초기화 실패가 전체 앱 부팅을 막지 않도록 방어
      Log.w("AppCheck", "Failed to initialize Firebase App Check", e)
    }

    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
