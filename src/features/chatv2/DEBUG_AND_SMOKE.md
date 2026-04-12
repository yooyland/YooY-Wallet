# Chat v2 — 실기기 업로드 디버그(t2) · 스모크(t6)

범위: `src/features/chatv2` 첨부/전송 플로우. 전역 검색·대용량 로그는 OOM 방지를 위해 이 문서만 참고하는 것을 권장합니다.

---

## 0. 작업 분담 (에이전트 완료 / 사용자 AAB)

| 담당 | 내용 |
|------|------|
| **에이전트(코드·문서)** | `yyChatFlow` + `EXPO_PUBLIC_CHATV2_FLOW_LOG`, `DEBUG_AND_SMOKE.md`, `.env.prod`에 운영 기본 `FLOW_LOG=0` 등 **반영 완료** |
| **사용자** | 아래만 수행하면 됨: **(1)** 스토어용 AAB 빌드 전 루트 `.env`에 `EXPO_PUBLIC_CHATV2_FLOW_LOG=1`이 남아 있지 않은지 확인(있으면 `0` 또는 삭제). **(2)** `build-release.ps1` 등으로 **AAB 빌드** |

> `app.config.js`는 여러 env 파일을 순서대로 로드합니다. **마지막에 로드되는 루트 `.env`**에 `FLOW_LOG=1`이 있으면 그 값이 우선합니다. 운영 AAB는 **`1` 없이** 빌드하세요.

---

## 1. 업로드 실패 시 로그 한 번만 확인 (t2)

### 1.1 콘솔 태그 (Metro / Xcode / Android Studio Logcat)

| 태그 | 용도 |
|------|------|
| `[YY_CHAT_FLOW]` | `yyChatFlow` — 업로드 단계별 (`media.upload.start`, `storage.upload.start`, `storage.error`, `media.firestore.writeReady` 등) |
| `[YY_CHAT_ATTACH]` | `logAttach` — 첨부 시작/성공/실패 (`attach.*.upload.fail`, `attach.file.flow.fail` 등) |
| `[YY_CHAT_V2_DM]` | `messageService` / 일부 화면의 DM 디버그 JSON |

> **릴리스에서 `[YY_CHAT_FLOW]` 켜기:** 프로젝트 루트 `.env`에 `EXPO_PUBLIC_CHATV2_FLOW_LOG=1` 추가 후 **앱을 다시 빌드** (Expo는 빌드 시점에 public env가 박힘). 끝나면 `0`으로 두거나 줄을 제거해 로그 스팸을 막습니다.  
> `logAttach`(`[YY_CHAT_ATTACH]`)는 별도 가드 없이 콘솔에 남습니다(릴리스에서도 출력됨 — 필요 시 `attachLog.ts`에서 조정).

### 1.2 Android — `adb logcat` 필터 예시

```bash
adb logcat -s ReactNativeJS:V *:S
```

또는 문자열 필터:

```bash
adb logcat | findstr /I "YY_CHAT_FLOW YY_CHAT_ATTACH storage.error upload.auth"
```

### 1.3 실패 원인 빠르게 매핑

| 로그에 보이는 키워드 | 의심 |
|---------------------|------|
| `auth-required` / `auth-not-ready` | Firebase 로그인 없음 또는 준비 전 |
| `upload.auth.fail` (`yyChatFlow`) | `ensureAuthedUid` 실패 (`lib/firebase`) |
| `storage.error` / `storage/...` | Storage 규칙, App Check, 네트워크, CORS(웹) |
| `timeout:` | 업로드/다운로드 URL 타임아웃 — 네트워크·파일 크기 |
| `unsupported_uri_scheme` | URI 정규화 실패 — `mediaService.normalizeUploadUri` |
| `firestore_write_ready_failed` | 업로드는 됐는데 메시지 문서 쓰기 실패 |

### 1.4 한 번만 보면 되는 순서

1. 채팅방에서 **같은 첨부**로 실패 재현 1회.
2. Metro/Logcat에서 **`storage.error` 직전**의 `YY_CHAT_FLOW` 한 줄과 **`code`/`message`** 확인.
3. 그 문자열로 Firebase 콘솔(Storage 규칙 / App Check)과 대조.

---

## 2. 스모크 시나리오 체크리스트 (t6)

**전제:** 로그인 완료, 상대 계정 1개 이상( DM 읽음·미읽음 확인용 ).

각 항목에서 **전송 성공 → 상대 화면 수신 → (해당 시) 재시도**까지 보면 됩니다.

### 2.1 필수 6종 (첨부·미디어 중심)

| # | 시나리오 | 확인 포인트 |
|---|----------|-------------|
| 1 | **사진** (앨범) | 말풍선 썸네일·탭 미리보기·상대 수신 |
| 2 | **동영상** (앨범) | 썸네일/▶·재생 또는 URL·상대 수신 |
| 3 | **파일** (문서) | PDF 등 Blob 업로드·실패 시 재시도 버튼 |
| 4 | **음성** (녹음) | 전송·수신 재생(가능한 경우) |
| 5 | **위치** | 권한 → 주소/지도 링크·Firestore 저장 |
| 6 | **QR** (이미지로 전송) | 말풍선 표시·URL 탭 |

### 2.2 추가 권장

| # | 시나리오 | 확인 포인트 |
|---|----------|-------------|
| 7 | **텍스트** | 전송·읽음/미읽음(DM)·목록 미읽음 배지 |
| 8 | **카메라 사진/동영상** | 촬영 직후 URI·업로드 |
| 9 | **투표** | 생성·투표 반영 |
| 10 | **실패 후 재시도** (`retryMediaV2`) | 실패 말풍선 → 재시도 → 성공·**미읽음 중복 없음** |

### 2.3 회귀 (이전에 고친 이슈)

- **방을 연 채로 상대 메시지 수신** → 방 목록 **미읽음 배지가 쌓이지 않음** (`ChatRoomV2` + `clearUnreadOnEnterV2` 스로틀).
- **첫 업로드 실패 후 재시도 성공** → 상대 **미읽음/목록 요약**이 빠지지 않음 (`meta.roomSummaryApplied` / `retryMediaV2`).

---

## 3. 관련 코드 위치 (참고만)

- 업로드: `services/mediaService.ts` → `messageService.sendMediaV2` → `core/uploadFlow.ts`
- 로그: `core/chatFlowLog.ts` (`EXPO_PUBLIC_CHATV2_FLOW_LOG=1` 시 릴리스에서도 `[YY_CHAT_FLOW]`), `core/attachLog.ts`
- 재시도: `messageService.retryMediaV2`

문서 끝.
