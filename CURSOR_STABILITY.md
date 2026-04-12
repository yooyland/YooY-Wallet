# Cursor + Android AAB + Firebase + Web3 동시 사용 안정화 가이드

이 문서는 **기능 변경 없이** Cursor 메모리(OOM)·인덱싱 과부하를 줄이기 위한 프로젝트 기준 권장 사항입니다.

---

## 1. Cursor OOM 방지 원인 요약

- **시스템 RAM이 많아도(예: 64GB) OOM이 날 수 있음**: Cursor는 **Electron(Chromium) 기반**이라 **창·렌더러·언어 서버 프로세스별 한도**가 있고, 순간적인 인덱싱·에이전트·긴 로그가 겹치면 **프로세스 단위로** `reason: 'oom'`이 날 수 있습니다. “PC 메모리 부족”과는 별개입니다.
- **전체 워크스페이스 인덱싱**: `node_modules`, Android Gradle/NDK 산출물, 캐시·로그가 한꺼번에 분석되면 메모리 사용이 급증합니다.
- **파일 감시(File watcher)**: 빌드 중 수천 개 파일이 바뀌면 에디터가 이벤트를 과도하게 받습니다.
- **검색/심볼**: 대용량 바이너리·로그·크래시 덤프가 검색에 포함되면 느려지고 메모리를 잡아먹습니다.
- **에이전트/긴 컨텍스트**: 한 번에 “전체 프로젝트”를 넘기면 토큰·메모리가 동시에 증가합니다.

---

## 2. 왜 `node_modules` / `android` / `ios`를 제외해야 하는지

| 경로 | 이유 |
|------|------|
| **node_modules** | 패키지 수·파일 수가 매우 많고, 소스 편집 대상이 아닙니다. 인덱싱·검색 제외 시 이득이 큽니다. |
| **android** | Gradle, NDK, `.cxx`, 빌드 산출물 등 **수만~수십만 파일**이 생길 수 있습니다. Cursor와 동시에 빌드하면 감시 부하가 겹칩니다. |
| **ios** | Xcode 산출물·Pods 등으로 무거워질 수 있습니다. (이 저장소에서 iOS 폴더가 없어도 설정은 유지해 두었습니다.) |

앱 기능은 그대로이며, **에디터가 덜 들여다보게** 만드는 설정입니다. 네이티브 코드를 직접 수정할 때는 해당 폴더를 일시적으로 열거나, 터미널/Android Studio에서 작업하는 방식을 권장합니다.

---

## 3. AAB 빌드는 별도 터미널에서 돌리기 (권장)

- Cursor **통합 터미널**에서 `gradlew`를 돌리면, 같은 프로세스 공간에서 로그·파일 이벤트가 겹칠 수 있습니다.
- **Windows 터미널**, **PowerShell**, **cmd** 등 **별도 창**에서 빌드하면 Cursor UI와 메모리 경합이 줄어듭니다.

프로젝트에 추가된 스크립트:

- `scripts/build-aab.ps1`
- `scripts/build-aab.bat`

---

## 4. Cursor Agent 요청은 짧게 나누기

- 한 번에 “전체 리팩터 + 모든 파일”보다 **파일/기능 단위**로 나누면 컨텍스트와 메모리 사용이 안정적입니다.
- `@`로 **필요한 파일만** 지정하면 불필요한 대용량 트리가 붙지 않습니다.

---

## 5. Web3 / Firebase 프로젝트가 무거운 이유

- **의존성**: `ethers`, `firebase` 등으로 `node_modules`가 커집니다.
- **타입·생성 코드**: `.d.ts`, 번들, 여러 엔트리가 언어 서버 부담을 늘립니다.
- **설정·환경**: 여러 환경 파일·상수가 검색 범위를 넓힙니다.  
→ **인덱싱 제외**와 **검색 제외**로 “앱 소스”에 집중하는 것이 좋습니다.

---

## 6. 추천 작업 순서

1. **Cursor에서 JS/TS 앱 코드 수정** (`app/`, `src/`, `lib/` 등)
2. **저장** (필요 시 TypeScript/ESLint가 돌아감)
3. **별도 터미널**에서 AAB 빌드:
   ```powershell
   .\scripts\build-aab.ps1
   ```
   또는
   ```bat
   scripts\build-aab.bat
   ```
4. 빌드 로그는 해당 터미널에서만 확인 (Cursor Problems 패널과 분리)

기본적으로 **clean은 실행하지 않습니다** (증분 빌드가 빠름). 필요할 때만 `android`에서 `gradlew clean`을 수동 실행하세요.

---

## 7. OOM 재발 시 확인 순서

1. **Cursor 재시작** 후 동일 작업인지 확인
2. `.cursorignore`에 `node_modules`, `android`, `build`, `.gradle`, `logs` 등이 있는지 확인
3. `.vscode/settings.json`의 `files.watcherExclude` / `search.exclude`가 유지되는지 확인
4. **AAB 빌드**를 Cursor 통합 터미널이 아닌 **외부 터미널**로 옮겼는지 확인
5. 에이전트 요청을 **범위 축소**(`@파일`) 후 재시도
6. Windows에서 **다른 무거운 앱**과 동시에 메모리를 쓰는지 확인 (브라우저 탭, 에뮬레이터 등)

---

## 8. 큰 명령어(Gradle / Metro / npm)에서 Cursor가 덜 불안정해지게

워크스페이스에 아래가 적용되어 있습니다.

| 설정 | 효과 |
|------|------|
| `typescript.tsserver.maxTsServerMemory` (8192) | TS 언어 서버 힙 상한 완화(대형 RN/모노레포에서 OOM 완화에 도움될 수 있음) |
| `terminal.integrated.scrollback` (10000) | 통합 터미널이 **무한 스크롤 버퍼**를 쌓지 않게 상한 |
| `search.maxResults` (5000) | 전역 검색 결과가 과도하게 커지는 것 완화 |
| `debug.console.maximumLines` (5000) | 디버그 콘솔 로그 상한 |
| `editor.largeFileOptimizations` | 대용량 파일 편집 시 에디터 부담 완화 |

**실행 습관 (권장)**

1. **가능하면 Windows 터미널 / PowerShell 별도 창**에서 빌드·`npm ci`·긴 로그 작업 실행 (Cursor와 메모리·파일 이벤트 분리).
2. 통합 터미널을 쓸 때는 **로그를 파일로도 저장**:  
   `.\scripts\build-aab.ps1 -LogFile "D:\logs\aab.log"`  
   또는 범용: `.\scripts\run-heavy.ps1 -Command "npm ci" -LogFile "D:\logs\npm-ci.log"`
3. **빌드 중**에는 에이전트 채팅·긴 `@` 컨텍스트를 줄이면 Cursor 프로세스 메모리 여유가 생깁니다.
4. Metro가 `ENOTEMPTY` 등으로 캐시 폴더를 못 지울 때: `%TEMP%\metro-cache` 를 **Cursor 종료 후** 수동 삭제 후 재시도.
5. Cursor를 **관리자 권한**으로 띄우면 일부 도구(샌드박스 등)가 비정상 동작할 수 있어 **일반 사용자 권한**을 권장합니다.

---

## 프로젝트에 적용된 파일

| 파일 | 역할 |
|------|------|
| `.cursorignore` | Cursor 인덱싱/검색 부하 완화 |
| `.vscode/settings.json` | 감시·검색 제외, 대용량 파일 메모리 한도, 터미널/검색/디버그 콘솔 상한 |
| `scripts/build-aab.ps1` / `build-aab.bat` | AAB release 빌드 (`-LogFile` 로 로그 파일 동시 저장 가능) |
| `scripts/run-heavy.ps1` | 임의 명령 + 선택적 로그 파일 (`Tee-Object`) |

---

*마지막 업데이트: 프로젝트 안정화 세팅 적용 시점 기준*
