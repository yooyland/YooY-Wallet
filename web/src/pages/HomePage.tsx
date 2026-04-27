import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div>
      <h1 className="yy-title">홈</h1>
      <div className="yy-card">
        <p>
          YooY Land Web은 PC 브라우저에서 <strong>지갑 정보</strong>, <strong>채팅</strong>, <strong>할 일</strong>, <strong>프로필</strong>,{' '}
          <strong>코인 정보</strong>를 이용할 수 있는 전용 화면입니다. Android/iOS 앱과 동일한 Firebase 프로젝트를 사용합니다.
        </p>
        <p className="yy-muted" style={{ marginTop: 12 }}>
          Web에서는 Buy/Sell/Order/Swap/DEX/Exchange 등 <strong>거래 실행·호가 UI를 제공하지 않습니다</strong>. 코인 정보 화면은 참고용이며 투자를 권유하지
          않습니다.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link className="yy-link" to="chat">
            채팅 열기
          </Link>
          {' · '}
          <Link className="yy-link" to="wallet">
            지갑
          </Link>
        </p>
      </div>
    </div>
  );
}
