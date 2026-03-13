// Reanimated must be imported at the very top to initialize JSI
import 'react-native-reanimated';
// Crypto: secure random for ethers on RN
import 'react-native-get-random-values';
// Boot Expo Router after shimming
import 'expo-router/entry';


// expo-router가 이 파일을 라우트로 인식할 때를 대비한 더미 컴포넌트
export default function EntryShim() {
  return null;
}

// 릴리즈에서 과도한 콘솔 출력은 성능에 영향을 줍니다. 프로덕션에서는 무시합니다.
if (!__DEV__) {
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	const noop = () => {};
	// @ts-ignore
	console.log = noop;
	// @ts-ignore
	console.info = noop;
	// 주의: 진단을 위해 경고/에러는 유지하여 초기 이슈를 추적합니다.
}

// Android 13+ 알림 권한 요청 및 채널 설정
(async () => {
	try {
		// 동적 import: 의존성이 없는 환경에서도 안전
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const Notifications = (() => { try { return require('expo-notifications'); } catch { return null; } })();
		if (!Notifications) return;

		// 기본 채널 보장
		if (Notifications.setNotificationChannelAsync) {
			try {
				await Notifications.setNotificationChannelAsync('default', {
					name: 'default',
					importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
					sound: undefined,
					vibrationPattern: [0, 250, 250, 250],
					lockscreenVisibility: 1,
				});
			} catch {}
		}

		// 권한 체크 후 요청
		if (Notifications.getPermissionsAsync && Notifications.requestPermissionsAsync) {
			const current = await Notifications.getPermissionsAsync();
			// canAskAgain이거나 status !== granted 이면 요청
			if ((current as any)?.canAskAgain || String((current as any)?.status) !== 'granted') {
				try { await Notifications.requestPermissionsAsync(); } catch {}
			}
		}
	} catch {}
})();

// 프로덕션에서 전역 fetch 타임아웃(기본 8초) + 동시요청 제한으로 과부하/버벅임 완화
(() => {
	try {
		// @ts-ignore
		if (typeof fetch === 'function' && typeof AbortController !== 'undefined') {
			// @ts-ignore
			const originalFetch = fetch;
			// 간단한 세마포어로 동시 요청 수 제한
			let inFlight = 0;
			const MAX_CONCURRENCY = 6;
			const queue: Array<() => void> = [];
			const acquire = () =>
				new Promise<void>((resolve) => {
					if (inFlight < MAX_CONCURRENCY) {
						inFlight += 1;
						resolve();
					} else {
						queue.push(() => {
							inFlight += 1;
							resolve();
						});
					}
				});
			const release = () => {
				inFlight = Math.max(0, inFlight - 1);
				const next = queue.shift();
				if (next) next();
			};
			// @ts-ignore
			global.fetch = (input: RequestInfo, init?: RequestInit) => {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 8000);
				const patched: RequestInit = {
					...(init || {}),
					signal: controller.signal,
					cache: 'no-store',
					// some RN runtimes accept keepalive, but disable to avoid long-held sockets
					// @ts-ignore
					keepalive: false,
				};
				return acquire()
					.then(() => originalFetch(input as any, patched))
					.finally(() => {
						clearTimeout(timeout);
						release();
					});
			};
		}
	} catch {}
})();
