param(
  [string]$ProjectId = "yooyland-dev"
)

Write-Host "🔥 Firestore deploy start (project: $ProjectId)"

# Ensure Node/npm exists
try { node -v | Out-Null } catch { Write-Error "Node.js가 필요합니다."; exit 1 }
try { npm -v | Out-Null } catch { Write-Error "npm이 필요합니다."; exit 1 }

# Ensure firebase-tools
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  Write-Host "📦 firebase-tools 설치 중..."
  npm i -g firebase-tools | Out-Null
}

# Use token if provided, otherwise interactive login
if ($env:FIREBASE_TOKEN) {
  Write-Host "🔑 FIREBASE_TOKEN 감지됨: 토큰 방식으로 배포합니다."
  firebase deploy --only firestore:rules,firestore:indexes --project $ProjectId --token $env:FIREBASE_TOKEN
} else {
  Write-Host "🔐 로그인 필요: 브라우저가 열리면 계정 인증을 완료해 주세요."
  firebase login
  firebase use $ProjectId
  firebase deploy --only firestore:rules,firestore:indexes
}

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ Firestore 규칙/인덱스 배포 완료 ($ProjectId)"
} else {
  Write-Error "❌ 배포 실패 (exit=$LASTEXITCODE)"
  exit $LASTEXITCODE
}



