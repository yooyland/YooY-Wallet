/**
 * Performance timing utility for development
 * Only logs in __DEV__ mode
 */

const timers: Record<string, number> = {};

export const perfStart = (label: string) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    timers[label] = Date.now();
  }
};

export const perfEnd = (label: string) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const start = timers[label];
    if (start) {
      const elapsed = Date.now() - start;
      console.log(`[PERF] ${label}: ${elapsed}ms`);
      delete timers[label];
      return elapsed;
    }
  }
  return 0;
};

export const perfLog = (label: string, message: string) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[PERF] ${label}: ${message}`);
  }
};

// App startup tracking
let appStartTime = Date.now();
export const getAppStartTime = () => appStartTime;
export const setAppStartTime = () => { appStartTime = Date.now(); };
export const logAppStartupTime = (phase: string) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const elapsed = Date.now() - appStartTime;
    console.log(`[PERF] App startup - ${phase}: ${elapsed}ms since app start`);
  }
};
