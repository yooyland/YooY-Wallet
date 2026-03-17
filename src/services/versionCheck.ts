/**
 * In-app update: version check service.
 * Reads latest/minimum version from Firebase Remote Config (if available) or fallback defaults.
 * Used for optional vs forced update prompts (KakaoTalk-style).
 */

export interface VersionConfig {
  latestVersionCode: number;
  latestVersionName: string;
  minimumSupportedVersionCode: number;
  updateMessage: string;
  storeUrl: string;
}

/** Safe defaults when Remote Config is missing or fails. Internal test builds (higher versionCode) must not trigger forced update. */
const FALLBACK_CONFIG: VersionConfig = {
  latestVersionCode: 2026031512,
  latestVersionName: '1.0.006',
  minimumSupportedVersionCode: 2026031510,
  updateMessage: '채팅 안정성과 알림 기능이 개선되었습니다.',
  storeUrl: 'https://play.google.com/store/apps/details?id=com.yooyland.wallet',
};

export type VersionConfigSource = 'remote_config' | 'version_url' | 'fallback';

const REMOTE_CONFIG_KEYS = {
  latestVersionCode: 'app_latest_version_code',
  latestVersionName: 'app_latest_version_name',
  minimumSupportedVersionCode: 'app_minimum_supported_version_code',
  updateMessage: 'app_update_message',
  storeUrl: 'app_store_url',
} as const;

function parseNumber(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

const LOG_PREFIX = '[VersionCheck]';
const DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ || (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_VERSION_CHECK_DEBUG === '1');

/**
 * Fetch version config from Firebase Remote Config.
 * Returns null if Remote Config is not set up or fetch fails.
 * During debug, uses shorter fetch interval to avoid stale cache.
 */
async function fetchFromRemoteConfig(): Promise<VersionConfig | null> {
  try {
    const { getRemoteConfig, fetchAndActivate, getValue } = await import('firebase/remote-config');
    const { firebaseApp } = await import('@/lib/firebase');
    const remoteConfig = getRemoteConfig(firebaseApp);
    remoteConfig.settings.minimumFetchIntervalMillis = DEBUG ? 0 : 3600 * 1000; // 0 in debug to force fresh fetch
    const activated = await fetchAndActivate(remoteConfig);
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Remote Config fetchAndActivate: activated=${activated} (true=from network, false=from cache)`);
    }
    const rawLatest = getValue(remoteConfig, REMOTE_CONFIG_KEYS.latestVersionCode).asString();
    const rawMin = getValue(remoteConfig, REMOTE_CONFIG_KEYS.minimumSupportedVersionCode).asString();
    const latestCode = parseNumber(rawLatest);
    const minCode = parseNumber(rawMin);
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Remote Config raw: latestVersionCode="${rawLatest}" -> ${latestCode}, minimumSupportedVersionCode="${rawMin}" -> ${minCode}`);
    }
    if (latestCode <= 0 && minCode <= 0) return null;
    const config = {
      latestVersionCode: latestCode > 0 ? latestCode : FALLBACK_CONFIG.latestVersionCode,
      latestVersionName: getValue(remoteConfig, REMOTE_CONFIG_KEYS.latestVersionName).asString() || FALLBACK_CONFIG.latestVersionName,
      minimumSupportedVersionCode: minCode > 0 ? minCode : FALLBACK_CONFIG.minimumSupportedVersionCode,
      updateMessage: getValue(remoteConfig, REMOTE_CONFIG_KEYS.updateMessage).asString() || FALLBACK_CONFIG.updateMessage,
      storeUrl: getValue(remoteConfig, REMOTE_CONFIG_KEYS.storeUrl).asString() || FALLBACK_CONFIG.storeUrl,
    };
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Remote Config resolved: latestVersionCode=${config.latestVersionCode}, minimumSupportedVersionCode=${config.minimumSupportedVersionCode} (source: remote_config)`);
    }
    return config;
  } catch (e) {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.warn(`${LOG_PREFIX} Remote Config fetch failed:`, e);
    }
    return null;
  }
}

/**
 * Fetch version config from a simple JSON endpoint (optional).
 * Use env EXPO_PUBLIC_VERSION_CHECK_URL if you host a version.json.
 */
async function fetchFromVersionUrl(): Promise<VersionConfig | null> {
  const url = process.env.EXPO_PUBLIC_VERSION_CHECK_URL;
  if (!url || typeof url !== 'string') return null;
  try {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const latestCode = parseNumber(data.latestVersionCode ?? data.latest_version_code);
    const minCode = parseNumber(data.minimumSupportedVersionCode ?? data.minimum_supported_version_code);
    if (latestCode <= 0) return null;
    return {
      latestVersionCode: latestCode > 0 ? latestCode : FALLBACK_CONFIG.latestVersionCode,
      latestVersionName: (data.latestVersionName ?? data.latest_version_name) as string || FALLBACK_CONFIG.latestVersionName,
      minimumSupportedVersionCode: minCode > 0 ? minCode : FALLBACK_CONFIG.minimumSupportedVersionCode,
      updateMessage: (data.updateMessage ?? data.update_message) as string || FALLBACK_CONFIG.updateMessage,
      storeUrl: (data.storeUrl ?? data.store_url) as string || FALLBACK_CONFIG.storeUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Get the version config: Remote Config → version URL → fallback defaults.
 * Returns config and source for logging.
 */
export async function getVersionConfig(): Promise<{ config: VersionConfig; source: VersionConfigSource }> {
  const fromRemote = await fetchFromRemoteConfig();
  if (fromRemote) {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Using config source: remote_config`);
    }
    return { config: fromRemote, source: 'remote_config' };
  }
  const fromUrl = await fetchFromVersionUrl();
  if (fromUrl) {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Using config source: version_url`);
    }
    return { config: fromUrl, source: 'version_url' };
  }
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} Using config source: fallback (latestVersionCode=${FALLBACK_CONFIG.latestVersionCode}, minimumSupportedVersionCode=${FALLBACK_CONFIG.minimumSupportedVersionCode})`);
  }
  return { config: FALLBACK_CONFIG, source: 'fallback' };
}

export type UpdateCheckResult =
  | { type: 'none' }
  | { type: 'optional'; config: VersionConfig }
  | { type: 'forced'; config: VersionConfig };

export interface VersionCheckDebugInfo {
  currentVersionCode: number;
  currentVersionName: string | null;
  latestVersionCode: number;
  latestVersionName: string;
  minimumSupportedVersionCode: number;
  configSource: VersionConfigSource;
  decision: 'forced' | 'optional' | 'none';
  reason: string;
}

/**
 * Compare current app version with config and return update state.
 * Logic (numeric versionCode only; versionName is never used for forced/optional decision):
 * - forced: currentVersionCode < minimumSupportedVersionCode
 * - optional: currentVersionCode >= minimumSupportedVersionCode && currentVersionCode < latestVersionCode
 * - none: currentVersionCode >= latestVersionCode (allow app usage)
 */
export function getUpdateType(
  currentVersionCode: number,
  config: VersionConfig,
  debugInfo?: { currentVersionName?: string | null; configSource?: VersionConfigSource }
): UpdateCheckResult & { debugInfo?: VersionCheckDebugInfo } {
  const { latestVersionCode, minimumSupportedVersionCode, latestVersionName } = config;
  const numCurrent = Number(currentVersionCode);
  const numMin = Number(minimumSupportedVersionCode);
  const numLatest = Number(latestVersionCode);

  let decision: 'forced' | 'optional' | 'none';
  let reason: string;

  if (numCurrent < numMin) {
    decision = 'forced';
    reason = `currentVersionCode(${numCurrent}) < minimumSupportedVersionCode(${numMin})`;
  } else if (numCurrent < numLatest) {
    decision = 'optional';
    reason = `currentVersionCode(${numCurrent}) >= minimum(${numMin}) but < latest(${numLatest})`;
  } else {
    decision = 'none';
    reason = `currentVersionCode(${numCurrent}) >= latestVersionCode(${numLatest})`;
  }

  const debug: VersionCheckDebugInfo = {
    currentVersionCode: numCurrent,
    currentVersionName: debugInfo?.currentVersionName ?? null,
    latestVersionCode: numLatest,
    latestVersionName,
    minimumSupportedVersionCode: numMin,
    configSource: debugInfo?.configSource ?? 'fallback',
    decision,
    reason,
  };

  // Always log when forced, or when DEBUG enabled (so logcat shows why popup appeared)
  const shouldLog = DEBUG || decision === 'forced';
  if (shouldLog) {
    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} currentVersionCode=${numCurrent} currentVersionName=${debug.currentVersionName ?? 'null'} | latestVersionCode=${numLatest} latestVersionName=${latestVersionName} | minimumSupportedVersionCode=${numMin} | source=${debug.configSource} | decision=${decision} | reason: ${reason}`
    );
  }

  if (decision === 'forced') {
    if (numCurrent > 0 && numCurrent < 100 && debug.currentVersionName) {
      // eslint-disable-next-line no-console
      console.warn(
        `${LOG_PREFIX} FORCED UPDATE will show but currentVersionCode=${numCurrent} is very low. If you built with gradle versionCode (e.g. 2026031512), ensure nativeBuildVersion returns that number, not versionName. raw nativeBuildVersion may be versionName (e.g. "1.0.005") which parseInt would give 1.`
      );
    }
    return { type: 'forced', config, debugInfo: debug };
  }
  if (decision === 'optional') {
    return { type: 'optional', config, debugInfo: debug };
  }
  return { type: 'none', debugInfo: debug };
}
