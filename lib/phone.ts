export function getCountryCodeForLanguage(language?: string): string {
  const lang = (language || 'en').toLowerCase();
  if (lang.startsWith('ko')) return '+82';
  if (lang.startsWith('ja')) return '+81';
  if (lang.startsWith('zh')) return '+86';
  // 요구사항: 영어는 +01 통일
  return '+01';
}

// 표시용 포맷: 입력값에서 기존 국가코드/하이픈 제거 후 언어별 국가코드 프리픽스 적용
export function formatPhoneForLocale(raw?: string | null, language?: string): string {
  if (!raw) return '';
  const code = getCountryCodeForLanguage(language);
  const digits = String(raw).replace(/\D/g, '');
  // 기존 국가코드 제거 (1~3자리) 및 선행 0 제거
  const withoutCode = digits.replace(/^(?:0|01|1|81|82|86)/, '');
  // 한국형/기타 간단 하이픈 처리
  if (code === '+82' && withoutCode.length >= 9) {
    const body = withoutCode.replace(/^0+/, '');
    const a = body.slice(0, 2);
    const b = body.slice(2, body.length - 4);
    const c = body.slice(-4);
    return `${code} ${a}-${b}-${c}`;
  }
  if (code === '+81' || code === '+86' || code === '+01') {
    // 3-3-4 기본 형태
    const body = withoutCode.slice(-10);
    const a = body.slice(0, 3);
    const b = body.slice(3, 6);
    const c = body.slice(6);
    return `${code} ${a}-${b}-${c}`;
  }
  return `${code} ${withoutCode}`;
}


