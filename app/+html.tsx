import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web 정적 렌더링 시 루트 HTML. WordPress와의 충돌 완화용 식별 클래스만 부여합니다.
 * (RN Web 인라인 스타일은 기존처럼 주입됨)
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="preload" href="/web/yooy-splash-logo.png" as="image" />
        <ScrollViewStyleReset />
      </head>
      <body className="yooy-web-app">{children}</body>
    </html>
  );
}
