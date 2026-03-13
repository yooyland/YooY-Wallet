package com.swmansion.worklets;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;

// Minimal stub so that libraries depending on Worklets compile and run safely.
public class WorkletsModule extends ReactContextBaseJavaModule {
  public WorkletsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "WorkletsModule";
  }

  // Reanimated calls this; provide safe no-op
  public void toggleSlowAnimations() {
    // no-op
  }
}


