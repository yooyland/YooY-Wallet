#include <jni.h>

JNIEXPORT jint JNICALL
Java_com_swmansion_worklets_NativeStub_init(JNIEnv* env, jobject thiz) {
  // No-op stub to satisfy linker when Reanimated links against libworklets.so
  return 0;
}


