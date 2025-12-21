import { create } from 'zustand';

export type ForwardPayload = {
  imageUrl?: string | null;
  fileUrl?: string | null;
  name?: string;
  display?: string;
};

interface ForwardModalState {
  visible: boolean;
  payload: ForwardPayload | null;
}

interface ForwardModalActions {
  open: (payload: ForwardPayload) => void;
  close: () => void;
}

export const useForwardModalStore = create<ForwardModalState & ForwardModalActions>((set) => ({
  visible: false,
  payload: null,
  open: (payload) => set({ visible: true, payload }),
  close: () => set({ visible: false, payload: null }),
}));


