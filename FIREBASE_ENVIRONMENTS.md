# 🔥 Firebase 환경별 설정 가이드

YooY Land 앱은 3개의 Firebase 프로젝트를 사용합니다:

## 📋 환경 구성

### 1. **Development (개발환경)**
- **프로젝트 ID**: `yooyland-dev`
- **도메인**: `yooyland-dev.firebaseapp.com`
- **용도**: 로컬 개발 및 테스트

### 2. **Staging (스테이징환경)**
- **프로젝트 ID**: `yooyland-stg`
- **도메인**: `yooyland-stg.firebaseapp.com`
- **용도**: 배포 전 최종 테스트

### 3. **Production (운영환경)**
- **프로젝트 ID**: `yooyland-prod`
- **도메인**: `yooyland-prod.firebaseapp.com`
- **용도**: 실제 서비스 운영

## 🚀 사용 방법

### 환경 설정
```bash
# 개발환경 설정
npm run env:dev

# 스테이징환경 설정
npm run env:stg

# 운영환경 설정
npm run env:prod
```

### 환경별 앱 실행
```bash
# 개발환경으로 실행
npm run start:dev

# 스테이징환경으로 실행
npm run start:stg

# 운영환경으로 실행
npm run start:prod
```

## 🔧 Firebase 프로젝트 설정

각 환경별로 Firebase Console에서 다음 설정이 필요합니다:

### 1. Authentication 설정
- **개발환경**: 테스트용 이메일/비밀번호 인증
- **스테이징환경**: 제한된 사용자 인증
- **운영환경**: 실제 사용자 인증

### 2. Firestore 데이터베이스
- **개발환경**: 테스트 데이터
- **스테이징환경**: 스테이징 데이터
- **운영환경**: 실제 서비스 데이터

### 3. Storage 설정
- **개발환경**: 개발용 이미지/파일
- **스테이징환경**: 테스트용 파일
- **운영환경**: 실제 사용자 파일

## 📁 환경 변수

각 환경별로 다음 환경 변수를 설정해야 합니다:

```bash
EXPO_PUBLIC_ENVIRONMENT=development|staging|production
EXPO_PUBLIC_FIREBASE_PROJECT_ID=yooyland-dev|yooyland-stg|yooyland-prod
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=yooyland-dev.firebaseapp.com
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=yooyland-dev.appspot.com
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## 🛡️ 보안 고려사항

1. **API 키 보안**: 각 환경별로 다른 API 키 사용
2. **데이터 격리**: 환경별 데이터베이스 완전 분리
3. **접근 권한**: 환경별 적절한 권한 설정
4. **모니터링**: 각 환경별 로그 및 모니터링 설정

## 🔄 배포 프로세스

1. **개발** → **스테이징** → **운영** 순서로 배포
2. 각 단계에서 충분한 테스트 수행
3. 운영 배포 전 스테이징에서 최종 검증

## 📊 모니터링

각 환경별로 다음을 모니터링합니다:
- Firebase Analytics
- Crashlytics
- Performance Monitoring
- 사용자 인증 로그
- 데이터베이스 사용량





