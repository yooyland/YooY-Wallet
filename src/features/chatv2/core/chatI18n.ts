import type { Lang } from '@/i18n';

export function chatTr(language: Lang | string | undefined, ko: string, en: string, ja?: string, zh?: string): string {
  if (language === 'ko') return ko;
  if (language === 'ja') return ja || en;
  if (language === 'zh') return zh || en;
  return en;
}

