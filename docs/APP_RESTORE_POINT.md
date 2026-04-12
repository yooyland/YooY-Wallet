# APP 복원 지점 (2026-04-11)

이 문서는 **요청 시점**의 앱 동작·구조를 복원 참고용으로 남깁니다. 실제 코드 스냅샷은 Git **태그** `restore-point/app-2026-04-11`이 가리키는 커밋을 사용하세요.

**태그가 가리키는 커밋:** 아래 명령으로 확인하세요. (스냅샷 본문은 `1249812` `chore(restore-point): APP snapshot…` 이후 문서 정리 커밋이 이어진 HEAD입니다.)

```bash
git rev-parse restore-point/app-2026-04-11^{commit}
```

## 복원 방법

```bash
# 해당 스냅샷 커밋으로만 돌아가기 (브랜치는 그대로)
git checkout restore-point/app-2026-04-11

# 또는 새 브랜치로 분리
git switch -c restore/from-2026-04-11 restore-point/app-2026-04-11
```

`.env` / `.env.prod` 는 보안상 이 스냅샷 커밋에 **포함하지 않았습니다**. 로컬 백업본을 유지하세요.

## 이 시점에 포함된 주요 동작 요약

- **마켓**: 기본 모의거래 (`EXPO_PUBLIC_MARKET_LIVE_TRADING=1`일 때만 실거래·잔액 검증). `appendPaperAdjustments` 없음 → 실제 보유/모니터 잔액 미반영. 상단 모의거래 배너, 가격 직접 입력, 모의 시 잔액 초과 검사 없음.
- **대시보드**: `dashboardWelcomeGateDone` — 앱 프로세스당 Welcome 로딩 1회. 탭 `router.navigate`.
- **채팅 미리보기 (chatv2)**: 유튜브 `m.youtube.com/watch` WebView. 지도 Google Static(키 있을 때) + OSM embed WebView 폴백.
- **ChatV2** 등 대량 신규/수정 파일은 워킹트리에 포함됨(태그 커밋 시점 기준).

## 태그 확인

```bash
git show restore-point/app-2026-04-11 --no-patch
```
