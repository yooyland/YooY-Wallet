export type Lang = 'en' | 'ko';

const dict: Record<Lang, Record<string, string>> = {
  en: {
    home: 'Home',
    explore: 'Explore',
    exchange: 'Exchange',
    wallet: 'Wallet',
    payments: 'Payments',
    chat: 'Chat',
    todo: 'To-Do',
    shop: 'Shop / NFT',
    signIn: 'Sign In',
    username: 'Username',
    password: 'Password',
  },
  ko: {
    home: '홈',
    explore: '탐색',
    exchange: '거래소',
    wallet: '지갑',
    payments: '입출금',
    chat: '채팅',
    todo: '일정/일기/가계부',
    shop: '쇼핑몰 / NFT',
    signIn: '로그인',
    username: '아이디',
    password: '비밀번호',
  },
};

export function t(key: string, lang: Lang = 'en'): string {
  return dict[lang]?.[key] ?? key;
}


