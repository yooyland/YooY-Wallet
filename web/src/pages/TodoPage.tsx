import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@web/auth/AuthProvider';
import { addTodo, listTodos, removeTodo, toggleTodo, type WebTodo } from '@web/lib/todoLocal';

export default function TodoPage() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [, bump] = useState(0);
  const items = useMemo(() => (uid ? listTodos(uid) : []), [uid, bump]);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => bump((x) => x + 1);

  useEffect(() => {
    refresh();
  }, [uid]);

  return (
    <div>
      <h1 className="yy-title">ToDo · 메모</h1>
      <div className="yy-card" style={{ maxWidth: 560 }}>
        <p className="yy-muted" style={{ marginBottom: 12 }}>
          이 목록은 <strong>이 브라우저에만</strong> 저장됩니다(앱의 AsyncStorage ToDo 와 별도). 동일 계정으로 기기 간 동기화되지 않습니다.
        </p>
        <input className="yy-input" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="yy-input" style={{ marginTop: 8 }} placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          type="button"
          className="yy-btn yy-btn-primary"
          style={{ marginTop: 10 }}
          disabled={!uid || !title.trim()}
          onClick={() => {
            addTodo(uid, title, note);
            setTitle('');
            setNote('');
            refresh();
          }}
        >
          추가
        </button>
      </div>
      <div className="yy-card" style={{ maxWidth: 560 }}>
        {items.length === 0 ? (
          <p className="yy-muted">할 일이 없습니다.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((t: WebTodo) => (
              <li key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--yy-border)' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={() => {
                      toggleTodo(uid, t.id);
                      refresh();
                    }}
                  />
                  <span style={{ textDecoration: t.completed ? 'line-through' : 'none', flex: 1 }}>
                    <strong>{t.title}</strong>
                    {t.note ? <div className="yy-muted" style={{ marginTop: 4 }}>{t.note}</div> : null}
                  </span>
                </label>
                <button
                  type="button"
                  className="yy-btn"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    removeTodo(uid, t.id);
                    refresh();
                  }}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
