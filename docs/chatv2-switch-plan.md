## YooY Chat v2 — 최종 전환(Switch) 플랜

### 목표
- **일반 사용자 동선에서는 v2만 사용**하게 만들고, legacy 채팅은 **디버그/비상 fallback**으로만 남긴다.
- legacy 삭제는 아직 하지 않는다(다음 단계에서 체크리스트 통과 후 진행).

---

## 현재까지 v2로 완전 전환된 것(사용자 동선)
- **탭/퀵액션/메뉴의 기본 Chat 진입**: `/chatv2`
- **QR 진입**: `/chatv2/scan` → `/chatv2/entry?raw=...` → 자동 라우팅/입장
- **v2 room list**: `/chatv2/rooms` (joinedRooms summary 기반)
- **v2 room screen**: `/chatv2/room?id=...`

## legacy(chat v1)가 남아있는 범위(비상/디버그)
- 코드/라우트는 그대로 유지:
  - `app/chat/*`
  - `src/features/chat/*`
- **정상 UI 경로에서는 연결하지 않음**
- 필요 시 수동으로 `/chat/rooms` 같은 legacy 라우트를 직접 열어 디버깅/rollback 확인 가능

---

## legacy를 완전히 은퇴(삭제)하기 전 “필수 조건”
아래 조건이 모두 충족될 때만 legacy 제거를 진행한다.
- **기능 조건**
  - DM 재사용(페어키), 그룹 방, TTL 방, 초대/링크/QR 진입이 v2에서 모두 정상
  - 미디어(image/video/file/pdf) 송수신/프리뷰가 sender/receiver 모두 정상
  - location이 도로명 기반으로 안정적으로 표기
  - leave/rejoin/reset/export가 v2에서 정상
  - unread/lastRead가 안정적이며 방 입장 시 즉시 0 처리
  - 설정(알림/폰트)이 per-user로 저장/로드/적용
- **품질 조건**
  - 성능: room list 빠름(요약만), room open 빠름(최신 20~30), typing이 부드러움
  - 크래시/치명 버그 없음(최소 2대 실기기)
- **운영 조건**
  - 릴리즈 빌드에서 legacy 진입 링크가 존재하지 않음(유저 동선 차단)
  - 디버그 fallback 진입 경로가 문서화되어 있고(수동 라우트), 팀이 인지

---

## 최종 cleanup 단계에서 제거/정리할 것(예정)
다음은 **v2-only 운영이 확정된 후**에 진행한다.
- **라우트 제거**
  - `app/chat/*`(legacy screens)
  - `app/(tabs)/chat.tsx` (탭 자체가 v2로 고정되면 정리 가능)
- **legacy feature code 제거**
  - `src/features/chat/*`
  - legacy store/listener/preview 코드
- **남은 리다이렉트/호환 코드 제거**
  - v2 전환을 위해 넣어둔 임시 redirect/alias
- **리소스/의존성 정리**
  - 사용하지 않는 패키지/에셋/권한(있다면) 정리

---

## 권장 실행 순서(v2-only 전환)
1. `docs/chatv2-retirement-checklist.md` 전 항목 실기기 검증
2. 문제가 있으면 v2만 수정(legacy는 건드리지 않음)
3. 체크리스트 통과 후, “legacy 삭제 PR”을 별도 PR로 진행(rollback 쉬움)

