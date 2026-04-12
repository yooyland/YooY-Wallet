/**
 * 미디어 업로드 실패 시 사용자에게 보여줄 짧은 한글 안내 (원문은 로그/메타에 유지)
 */
export function formatChatUploadError(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '전송에 실패했습니다.';
  const lower = s.toLowerCase();
  if (lower.includes('auth-required') || lower.includes('auth_not_ready') || lower.includes('auth-not-ready')) {
    return '로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.';
  }
  if (/file_too_large|max_\d+_bytes/i.test(s)) {
    return '파일이 너무 큽니다. (최대 약 36MB)';
  }
  if (lower.includes('timeout:')) {
    return '시간이 초과되었습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';
  }
  if (/file_not_found|unsupported_uri|empty_uri/i.test(lower)) {
    return '파일을 읽을 수 없습니다. 다시 선택해 주세요.';
  }
  if (lower.includes('upload_no_url')) {
    return '업로드 주소를 받지 못했습니다. 다시 시도해 주세요.';
  }
  if (lower.includes('firestore_write_ready_failed')) {
    return '메시지 저장에 실패했습니다. 다시 시도해 주세요.';
  }
  return s.length > 96 ? `${s.slice(0, 93)}…` : s;
}
