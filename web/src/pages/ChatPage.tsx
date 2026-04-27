import { useEffect, useMemo, useRef, useState } from 'react';
import { createSearchParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@web/auth/AuthProvider';
import {
  clearUnreadOnEnterWeb,
  sendFileOrImageWeb,
  sendTextMessageWeb,
  subscribeJoinedRooms,
  subscribeRoomMessages,
  touchMessageRead,
  type ChatMsg,
  type JoinedRoomRow,
} from '@web/lib/chat';
import { subscribeFriends, type FriendDoc } from '@web/lib/friends';
import { getOrCreateDmRoomIdWeb } from '@web/lib/dmWeb';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@web/firebase/config';
import { resolveChatDisplayNameFromUserDoc } from '@web/lib/chatDisplayName';

function mediaUrl(m: ChatMsg): string {
  const a = m.attachment as { remoteUrl?: string; url?: string } | undefined;
  return String(a?.remoteUrl || a?.url || m.url || '').trim();
}

function formatTime(ts?: number) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ChatPage() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [sp, setSp] = useSearchParams();
  const roomId = String(sp.get('room') || '').trim();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'rooms' | 'friends'>('rooms');
  const [rooms, setRooms] = useState<JoinedRoomRow[]>([]);
  const [friends, setFriends] = useState<FriendDoc[]>([]);
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeJoinedRooms(uid, setRooms);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeFriends(uid, setFriends);
  }, [uid]);

  useEffect(() => {
    if (!friends.length) return;
    let alive = true;
    void (async () => {
      const pairs = await Promise.all(
        friends.map(async (f) => {
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
      for (const p of pairs) if (p) o[p[0]] = p[1];
      setPeerNames(o);
    })();
    return () => {
      alive = false;
    };
  }, [friends]);

  useEffect(() => {
    if (!roomId) {
      setMsgs([]);
      return;
    }
    const unsub = subscribeRoomMessages(roomId, setMsgs);
    if (uid) void clearUnreadOnEnterWeb(roomId, uid);
    return () => unsub();
  }, [roomId, uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, roomId]);

  const title = useMemo(() => {
    const row = rooms.find((r) => r.roomId === roomId);
    if (row?.title) return row.title;
    if (row?.lastMessage) return row.roomId.slice(0, 8) + '…';
    return roomId ? `방 ${roomId.slice(0, 8)}…` : '대화 선택';
  }, [rooms, roomId]);

  const selectRoom = (id: string) => {
    setSp(createSearchParams({ room: id }));
  };

  const readState = (m: ChatMsg) => {
    if (!uid || m.senderId !== uid) return null;
    const rb = m.readBy || {};
    const others = Object.keys(rb).filter((k) => k !== uid);
    if (others.length) return '읽음';
    return '전달됨';
  };

  return (
    <div>
      <h1 className="yy-title" style={{ marginBottom: 12 }}>
        채팅
      </h1>
      <div className="yy-chat-grid">
        <div className="yy-chat-col yy-list">
          <div className="yy-chat-tabs">
            <button type="button" className={tab === 'rooms' ? 'yy-on' : ''} onClick={() => setTab('rooms')}>
              대화방
            </button>
            <button type="button" className={tab === 'friends' ? 'yy-on' : ''} onClick={() => setTab('friends')}>
              친구
            </button>
          </div>
          <div className="yy-room-list">
            {tab === 'rooms' ? (
              rooms.length === 0 ? (
                <div className="yy-muted" style={{ padding: 16 }}>
                  참여 중인 방이 없습니다.
                </div>
              ) : (
                rooms.map((r) => (
                  <button
                    key={r.roomId}
                    type="button"
                    className={`yy-room-row ${r.roomId === roomId ? 'yy-sel' : ''}`}
                    onClick={() => selectRoom(r.roomId)}
                  >
                    <div style={{ fontWeight: 600 }}>{r.title || r.type || '방'}</div>
                    <div className="yy-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {(r.lastMessage || '').slice(0, 80)}
                    </div>
                    {typeof r.unreadCount === 'number' && r.unreadCount > 0 ? <span className="yy-pill">{r.unreadCount}</span> : null}
                  </button>
                ))
              )
            ) : friends.length === 0 ? (
              <div className="yy-muted" style={{ padding: 16 }}>
                친구가 없습니다.
              </div>
            ) : (
              friends.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="yy-room-row"
                  onClick={async () => {
                    if (!uid || !f.userId) return;
                    const id = await getOrCreateDmRoomIdWeb(uid, f.userId);
                    selectRoom(id);
                    setTab('rooms');
                  }}
                >
                  {peerNames[f.userId] || f.chatName || f.displayName || f.userId}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="yy-chat-col">
          {!roomId ? (
            <div className="yy-muted" style={{ padding: 24 }}>
              왼쪽에서 방을 선택하거나 친구를 눌러 DM을 여세요.
            </div>
          ) : (
            <div className="yy-thread">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--yy-border)', fontWeight: 700 }}>{title}</div>
              <div className="yy-msgs">
                {msgs.map((m) => {
                  const me = m.senderId === uid;
                  const url = mediaUrl(m);
                  return (
                    <div key={m.id} className={`yy-bubble ${me ? 'yy-me' : ''}`}>
                      {m.type === 'text' || !m.type ? <div style={{ whiteSpace: 'pre-wrap' }}>{m.text || ''}</div> : null}
                      {m.type === 'image' && url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
                        </a>
                      ) : null}
                      {m.type === 'video' && url ? <video src={url} controls style={{ maxWidth: '100%', borderRadius: 8 }} /> : null}
                      {m.type === 'file' && url ? (
                        <a className="yy-link" href={url} target="_blank" rel="noreferrer">
                          {m.filename || '파일 다운로드'}
                        </a>
                      ) : null}
                      <div className="yy-msg-meta">
                        {formatTime(m.createdAt)}
                        {me ? ` · ${readState(m) || ''}` : null}
                        {!me && uid ? (
                          <button
                            type="button"
                            className="yy-btn"
                            style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}
                            onClick={() => touchMessageRead(roomId, m.id, uid)}
                          >
                            읽음 표시
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form
                className="yy-compose"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!uid || !roomId || !text.trim() || sending) return;
                  setSending(true);
                  try {
                    await sendTextMessageWeb(roomId, uid, text);
                    setText('');
                  } catch (err) {
                    alert(String((err as Error)?.message || err));
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <input type="file" ref={fileRef} hidden onChange={async (ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = '';
                  if (!f || !uid || !roomId) return;
                  setSending(true);
                  try {
                    await sendFileOrImageWeb(roomId, uid, f);
                  } catch (err) {
                    alert(String((err as Error)?.message || err));
                  } finally {
                    setSending(false);
                  }
                }} />
                <button type="button" className="yy-btn" onClick={() => fileRef.current?.click()} disabled={sending}>
                  첨부
                </button>
                <input className="yy-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="메시지 입력" />
                <button type="submit" className="yy-btn yy-btn-primary" disabled={sending || !text.trim()}>
                  보내기
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      <p className="yy-muted" style={{ marginTop: 12 }}>
        <button type="button" className="yy-btn" style={{ marginTop: 4 }} onClick={() => navigate({ pathname: 'friends' })}>
          친구 전용 화면
        </button>
      </p>
    </div>
  );
}
