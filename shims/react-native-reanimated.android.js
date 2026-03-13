// Minimal Android shim for react-native-reanimated to avoid native init crashes.
// Provides no-op implementations sufficient for app startup.
export const Easing = {
  linear: (t) => t,
  quad: (t) => t * t,
};

export const useSharedValue = (initial) => ({ value: initial });
export const useDerivedValue = (fn, deps) => ({ value: fn?.() });
export const useAnimatedStyle = (fn, deps) => ({});
export const useAnimatedProps = (fn, deps) => ({});
export const useAnimatedRef = () => ({ current: null });
export const withTiming = (toValue, config, cb) => toValue;
export const withSpring = (toValue, config, cb) => toValue;
export const withDelay = (delay, cb) => cb;
export const runOnJS = (fn) => (...args) => fn?.(...args);
export const runOnUI = (fn) => fn;
export const cancelAnimation = () => {};
export const measure = () => null;
export const scrollTo = () => {};
export const interpolate = (x, input, output) => {
  if (x <= input[0]) return output[0];
  if (x >= input[input.length - 1]) return output[output.length - 1];
  return output[0];
};

export const useAnimatedGestureHandler = (handlers) => handlers || {};
export const createAnimatedComponent = (Component) => Component;
export const isReanimated = true;
export const isConfigured = true;

export default {
  Easing,
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedRef,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  runOnUI,
  cancelAnimation,
  measure,
  scrollTo,
  interpolate,
  useAnimatedGestureHandler,
  createAnimatedComponent,
  isReanimated,
  isConfigured,
};


