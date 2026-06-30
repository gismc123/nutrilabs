import { create } from 'zustand';

export const useUiStore = create((set) => ({
  activeBottomSheet: null,
  confirmDialog: null,

  openBottomSheet: (name) => set({ activeBottomSheet: name }),
  closeBottomSheet: () => set({ activeBottomSheet: null }),

  showConfirm: (title, message, onConfirm) =>
    set({ confirmDialog: { open: true, title, message, onConfirm } }),
  closeConfirm: () => set({ confirmDialog: null }),
}));
