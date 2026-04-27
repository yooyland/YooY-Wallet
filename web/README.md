# `web/` (Vite) — 레거시/보조

**yooyland.com/web 에 올릴 공식 웹앱은 Expo Router 정적 빌드 `web-dist/` 입니다.**  
모바일과 동일 UI를 쓰려면 루트에서:

```bash
npm run web:build
```

결과물: **`web-dist/`** (업로드 대상)

---

## Vite 폴더(`web/`)는?

초기에 만든 **별도 Vite SPA**입니다. 필요 시에만 사용합니다.

```bash
npm run web:vite:build
```

---

## Expo 웹 배포 요약

1. `app.json` 의 `experiments.baseUrl` 이 **`/web`** 이므로 자산·라우팅이 `/web` 기준으로 맞춰집니다.
2. `npm run web:build` → `web-dist/` 생성.
3. **`web-dist/` 전체**를 서버의 **`/web/`** 디렉터리에 업로드.
4. Apache: 루트 `public/.htaccess` 가 export 시 `web-dist` 로 복사됩니다.

자세한 설정은 프로젝트 루트 `app.json` · `app/+html.tsx` · `app/_layout.tsx`(PC 중앙 프레임) · `lib/featureFlags.ts`(Web 거래 비활성) 를 참고하세요.
