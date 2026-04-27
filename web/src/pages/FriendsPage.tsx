import { useEffect, useState } from 'react';
import { createSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@web/auth/AuthProvider';
import { subscribeFriends, type FriendDoc } from '@web/lib/friends';
import { getOrCreateDmRoomIdWeb } from '@web/lib/dmWeb';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@web/firebase/config';
import { resolveChatDisplayNameFromUserDoc } from '@web/lib/chatDisplayName';

function friendLabel(f: FriendDoc, peerNames: Record<string, string>) {
  const id = f.userId;
  if (peerNames[id]) return peerNames[id];
  const raw = (f.chatName || f.displayName || f.name || '').trim();
  if (raw) return raw;
  return id || '—';
}

export default function FriendsPage() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [rows, setRows] = useState<FriendDoc[]>([]);
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!uid) return;
    return subscribeFriends(uid, setRows);
  }, [uid]);

  useEffect(() => {
    if (!rows.length) return;
    let alive = true;
    void (async () => {
      const pairs = await Promise.all(
        rows.map(async (f) => {
          if (!f.userId) return null;
          try {
            const s = await getDoc(doc(db, 'users', f.userId));
            if (!s.exists()) return [f.userId, f.userId] as const;
            return [f.userId, resolveChatDisplayNameFromUserDoc(f.userId, s.data() as Record<string, unknown>)] as const;
          } catch {
            return [f.userId, f.userId] as const;
          }
        })
      );
      if (!alive) return;
      const o: Record<string, string> = {};
      for (const p of pairs) {
        if (p) o[p[0]] = p[1];
      }
      setPeerNames(o);
    })();
    return () => {
      alive = false;
    };
  }, [rows]);

  return (
    <div>
      <h1 className="yy-title">친구</h1>
      <div className="yy-card" style={{ maxWidth: 560 }}>
        {rows.length === 0 ? (
          <p className="yy-muted">친구 목록이 비어 있습니다. 모바일 앱에서 추가한 친구가 여기 동기화됩니다.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((f) => (
              <li
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--yy-border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{friendLabel(f, peerNames)}</div>
                  <div className="yy-muted" style={{ fontSize: 12 }}>
                    {f.userId}
                  </div>
                </div>
                <button
                  type="button"
                  className="yy-btn yy-btn-primary"
                  disabled={!uid || busy === f.userId}
                  onClick={async () => {
                    if (!uid || !f.userId) return;
                    setBusy(f.userId);
                    try {
                      const roomId = await getOrCreateDmRoomIdWeb(uid, f.userId);
                      navigate({ pathname: 'chat', search: createSearchParams({ room: roomId }).toString() });
                    } catch (e) {
                      alert(String((e as Error)?.message || e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  메시지
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
