/**
 * In-app update: check on launch, optional vs forced, dismissal cache for optional.
 * Runs once after app is ready; optional update dismissal cached for 24h to avoid spam.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getVersionConfig, getUpdateType, type UpdateCheckResult } from '@/src/services/versionCheck';

const DISMISSAL_KEY = '@yooy_optional_update_dismissed_at';
const DISMISSAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOG_PREFIX = '[VersionCheck]';
const DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ || (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_VERSION_CHECK_DEBUG === '1');

export interface CurrentVersionResult {
  versionCode: number;
  versionName: string | null;
  source: 'native_build' | 'expo_constants' | 'none';
  rawBuildVersion: string | null;
  rawAppVersion: string | null;
}

/**
 * Read versionCode from the installed app. On Android this uses PackageInfo.versionCode
 * (expo-application.nativeBuildVersion). Do NOT use versionName for update decision.
 */
async function getCurrentVersion(): Promise<CurrentVersionResult> {
  let rawBuildVersion: string | null = null;
  let rawAppVersion: string | null = null;
  let nativeCode = 0;
  let constantsCode = 0;

  // 1) nativeBuildVersion (실제 설치된 APK/AAB의 PackageInfo.versionCode)
  try {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      const Application = require('expo-application').default;
      rawBuildVersion = Application.nativeBuildVersion ?? null;
      rawAppVersion = Application.nativeApplicationVersion ?? null;
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`${LOG_PREFIX} raw nativeBuildVersion="${rawBuildVersion}" (should map to versionCode) raw nativeApplicationVersion="${rawAppVersion}" (versionName, do not use for decision)`);
      }
      if (rawBuildVersion != null && String(rawBuildVersion).trim() !== '') {
        const trimmed = String(rawBuildVersion).trim();
        const n = parseInt(trimmed, 10);
        if (!Number.isNaN(n) && n > 0) {
          nativeCode = n;
        } else if (DEBUG && trimmed.includes('.')) {
          // eslint-disable-next-line no-console
          console.warn(`${LOG_PREFIX} nativeBuildVersion looks like versionName ("${trimmed}"). parseInt gave ${n}. Ensure Android build uses numeric versionCode in gradle (not "1.0.004").`);
        }
      }
    }
  } catch (e) {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.warn(`${LOG_PREFIX} native version read failed:`, e);
    }
  }

  // 2) expo-constants fallback (app.json / app.config 의 android.versionCode)
  try {
    const Constants = require('expo-constants').default;
    const c = Constants.expoConfig ?? Constants.default?.expoConfig;
    const v = c?.android?.versionCode ?? c?.versionCode;
    if (v != null) {
      const n = parseInt(String(v), 10);
      if (!Number.isNaN(n) && n > 0) {
        constantsCode = n;
      }
    }
  } catch {}

  // 3) 두 값이 모두 있는 경우, 더 큰 값을 사용 (내부 테스트 빌드에서 versionCode가 더 크기 때문)
  const bestCode = Math.max(nativeCode || 0, constantsCode || 0);
  const source: CurrentVersionResult['source'] =
    bestCode === nativeCode && bestCode > 0 ? 'native_build'
      : bestCode === constantsCode && bestCode > 0 ? 'expo_constants'
      : 'none';

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} resolved currentVersionCode=${bestCode} (native=${nativeCode}, constants=${constantsCode}, source=${source})`
    );
  }

  if (bestCode <= 0) {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} currentVersionCode unknown (0); allowing app usage source=none`);
    }
    return { versionCode: 0, versionName: rawAppVersion, source: 'none', rawBuildVersion, rawAppVersion };
  }

  return { versionCode: bestCode, versionName: rawAppVersion, source, rawBuildVersion, rawAppVersion };
}

async function getDismissedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSAL_KEY);
    if (!raw) return null;
    const t = parseInt(raw, 10);
    if (Number.isNaN(t)) return null;
    return t;
  } catch {
    return null;
  }
}

async function setDismissedAt(): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSAL_KEY, String(Date.now()));
  } catch {}
}

export interface UseAppVersionCheckResult {
  result: UpdateCheckResult | null;
  loading: boolean;
  dismissOptional: () => void;
}

/**
 * Run version check on mount. Returns update result (optional/forced/none), loading state,
 * and dismissOptional to cache "나중에" for optional update.
 * For Android/Play only for now; structure allows iOS/App Store later.
 */
export function useAppVersionCheck(): UseAppVersionCheckResult {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  const dismissOptional = useCallback(() => {
    setDismissedAt();
    setResult(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
          setLoading(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
        if (cancelled) return;
        const [currentVersion, { config, source }] = await Promise.all([
          getCurrentVersion(),
          getVersionConfig(),
        ]);

        if (cancelled) return;

        const currentCode = currentVersion.versionCode;
        if (currentCode <= 0) {
          if (DEBUG) {
            // eslint-disable-next-line no-console
            console.log(`${LOG_PREFIX} currentVersionCode=${currentCode} (invalid); skip update check, allow app. rawBuildVersion=${currentVersion.rawBuildVersion} rawAppVersion=${currentVersion.rawAppVersion}`);
          }
          setResult(null);
          setLoading(false);
          return;
        }

        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(`${LOG_PREFIX} currentVersionCode=${currentCode} currentVersionName=${currentVersion.versionName} | latestVersionCode=${config.latestVersionCode} latestVersionName=${config.latestVersionName} | minimumSupportedVersionCode=${config.minimumSupportedVersionCode} | configSource=${source}`);
        }
        const updateResult = getUpdateType(currentCode, config, {
          currentVersionName: currentVersion.versionName,
          configSource: source,
        });

        if (updateResult.type === 'forced') {
          setResult(updateResult);
          setLoading(false);
          return;
        }

        if (updateResult.type === 'optional') {
          const dismissedAt = await getDismissedAt();
          if (dismissedAt != null && Date.now() - dismissedAt < DISMISSAL_TTL_MS) {
            setResult(null);
          } else {
            setResult(updateResult);
          }
        } else {
          setResult(null);
        }
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { result, loading, dismissOptional };
}
