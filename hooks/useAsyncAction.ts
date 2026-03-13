import { useCallback, useRef, useState } from 'react';

type Options = {
	timeoutMs?: number;
	onStart?: () => void;
	onSuccess?: () => void;
	onError?: (err: unknown) => void;
};

export function useAsyncAction<T extends any[]>(
	action: (...args: T) => Promise<any> | void,
	{ timeoutMs = 5000, onStart, onSuccess, onError }: Options = {},
) {
	const [loading, setLoading] = useState(false);
	const inFlight = useRef<null | { cancel: () => void }>(null);

	const run = useCallback(
		async (...args: T) => {
			// 중복 클릭 방지
			if (loading) return;
			setLoading(true);
			onStart?.();
			let timeout: any;
			try {
				// 타임아웃 가드
				let timedOut = false;
				await Promise.race([
					(async () => {
						await Promise.resolve(action(...args));
					})(),
					new Promise((_, rej) => {
						timeout = setTimeout(() => {
							timedOut = true;
							rej(new Error('TIMEOUT'));
						}, timeoutMs);
					}),
				]);
				if (!timedOut) onSuccess?.();
			} catch (e) {
				onError?.(e);
			} finally {
				clearTimeout(timeout);
				inFlight.current = null;
				setLoading(false);
			}
		},
		[action, loading, onStart, onSuccess, onError, timeoutMs],
	);

	return { run, loading };
}


