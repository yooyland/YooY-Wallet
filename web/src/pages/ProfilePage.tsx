import { useEffect, useState } from 'react';
import { useAuth } from '@web/auth/AuthProvider';
import { mergeUserProfile, subscribeUserDoc, type UserPublicDoc } from '@web/lib/userDoc';

export default function ProfilePage() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [doc, setDoc] = useState<UserPublicDoc | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [chatName, setChatName] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!uid) return;
    return subscribeUserDoc(uid, (d) => {
      setDoc(d);
      setDisplayName(String(d?.displayName || user?.displayName || ''));
      setChatName(String(d?.chatName || ''));
      setUsername(String(d?.username || ''));
    });
  }, [uid, user?.displayName]);

  return (
    <div>
      <h1 className="yy-title">프로필</h1>
      <div className="yy-card" style={{ maxWidth: 520 }}>
        <p className="yy-muted">Firestore `users/` + 본인 uid 문서에 병합 저장합니다(앱 프로필과 공유).</p>
        <label className="yy-muted">표시 이름</label>
        <input className="yy-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label className="yy-muted" style={{ display: 'block', marginTop: 12 }}>
          채팅 이름 (chatName)
        </label>
        <input className="yy-input" value={chatName} onChange={(e) => setChatName(e.target.value)} />
        <label className="yy-muted" style={{ display: 'block', marginTop: 12 }}>
          사용자명 (username)
        </label>
        <input className="yy-input" value={username} onChange={(e) => setUsername(e.target.value)} />
        <button
          type="button"
          className="yy-btn yy-btn-primary"
          style={{ marginTop: 16 }}
          disabled={!uid || busy}
          onClick={async () => {
            setBusy(true);
            setMsg('');
            try {
              await mergeUserProfile(uid, {
                displayName: displayName.trim() || undefined,
                chatName: chatName.trim() || undefined,
                username: username.trim() || undefined,
              });
              setMsg('저장되었습니다.');
            } catch (e) {
              setMsg(String((e as Error)?.message || e));
            } finally {
              setBusy(false);
            }
          }}
        >
          저장
        </button>
        {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
        <pre className="yy-muted" style={{ marginTop: 16, fontSize: 11, overflow: 'auto' }}>
          {JSON.stringify(doc, null, 2)}
        </pre>
      </div>
    </div>
  );
}
