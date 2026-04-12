/**
 * 일반 링크 미리보기 WebView: https/http는 인앱 유지, intent/앱 스킴만 차단.
 * (youtube.com/embed 등 https 하위 리소스는 그대로 로드)
 */
import { Platform } from 'react-native';

export const WEBVIEW_MOBILE_USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/**
 * @returns true 이면 WebView가 해당 URL을 로드함.
 */
export function shouldLoadRequestInChatWebView(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  const lower = u.toLowerCase();
  if (lower.startsWith('about:') || lower.startsWith('data:') || lower.startsWith('blob:')) return true;
  if (lower.startsWith('file:')) return true;

  if (/^intent:/i.test(u) || /^market:/i.test(u)) return false;
  if (/^vnd\.youtube:/i.test(u) || /^youtube:\/\//i.test(lower) || /^yt:\/\//i.test(lower)) return false;
  if (/^googlechrome:/i.test(lower)) return false;

  return /^https?:\/\//i.test(u);
}
