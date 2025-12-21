import { firestore, firebaseStorage } from '@/lib/firebase';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export type BoardPost = {
  id?: string;
  title: string;
  body: string; // markdown
  images?: string[]; // download URLs
  tags?: string[];
  pinned?: boolean;
  visible?: boolean;
  author?: string;
  createdAt?: any;
  updatedAt?: any;
};

export function boardCol(boardId: string) {
  return collection(firestore, 'boards', boardId, 'posts');
}

export async function createPost(boardId: string, post: BoardPost) {
  return await addDoc(boardCol(boardId), {
    title: post.title,
    body: post.body,
    images: post.images ?? [],
    tags: post.tags ?? [],
    pinned: !!post.pinned,
    visible: post.visible !== false,
    author: post.author ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updatePost(boardId: string, id: string, updates: Partial<BoardPost>) {
  const d = doc(firestore, 'boards', boardId, 'posts', id);
  await updateDoc(d, { ...updates, updatedAt: serverTimestamp() });
}

export async function deletePost(boardId: string, id: string) {
  await deleteDoc(doc(firestore, 'boards', boardId, 'posts', id));
}

export function subscribePosts(boardId: string, options: { pageSize?: number; search?: string; tags?: string[]; visibleOnly?: boolean; onData: (rows: BoardPost[], cursor: any | null) => void; }) {
  const pageSize = options.pageSize ?? 20;
  let q = query(boardCol(boardId), orderBy('pinned', 'desc'), orderBy('createdAt', 'desc'), limit(pageSize));
  if (options.visibleOnly) {
    q = query(boardCol(boardId), where('visible', '==', true), orderBy('pinned', 'desc'), orderBy('createdAt', 'desc'), limit(pageSize));
  }
  return onSnapshot(q, (snap) => {
    const rows: BoardPost[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
    const last = snap.docs[snap.docs.length - 1] ?? null;
    options.onData(rows, last);
  });
}

export async function fetchNext(boardId: string, cursor: any, options: { pageSize?: number; visibleOnly?: boolean; search?: string; tags?: string[]; }) {
  const pageSize = options.pageSize ?? 20;
  let q = query(boardCol(boardId), orderBy('pinned', 'desc'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
  if (options.visibleOnly) {
    q = query(boardCol(boardId), where('visible', '==', true), orderBy('pinned', 'desc'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
  }
  const snap = await getDocs(q);
  const rows: BoardPost[] = [];
  snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
  const last = snap.docs[snap.docs.length - 1] ?? null;
  return { rows, cursor: last };
}

export async function uploadImageAndGetUrl(boardId: string, file: Blob, filename: string) {
  const r = ref(firebaseStorage, `boards/${boardId}/${Date.now()}-${filename}`);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}







