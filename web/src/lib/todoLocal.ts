const key = (uid: string) => `yooy-web-todo:${uid}`;

export type WebTodo = { id: string; title: string; note?: string; completed: boolean; createdAt: number };

function load(uid: string): WebTodo[] {
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function save(uid: string, items: WebTodo[]) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(items));
  } catch {
    /* noop */
  }
}

export function listTodos(uid: string): WebTodo[] {
  return load(uid).sort((a, b) => b.createdAt - a.createdAt);
}

export function addTodo(uid: string, title: string, note?: string): WebTodo {
  const items = load(uid);
  const t: WebTodo = {
    id: crypto.randomUUID(),
    title: title.trim(),
    note: note?.trim() || undefined,
    completed: false,
    createdAt: Date.now(),
  };
  items.unshift(t);
  save(uid, items);
  return t;
}

export function toggleTodo(uid: string, id: string) {
  const items = load(uid).map((x) => (x.id === id ? { ...x, completed: !x.completed } : x));
  save(uid, items);
}

export function removeTodo(uid: string, id: string) {
  save(
    uid,
    load(uid).filter((x) => x.id !== id)
  );
}
