import { create } from "zustand";

type FocusState = {
  userId: string | null;
  taskId: string | null;
  setUser: (id: string | null) => void;
  setTask: (id: string | null) => void;
};

const key = (userId: string) => "qa-react-focus:" + userId;
function read(id: string): string | null {
  try { return sessionStorage.getItem(key(id)); } catch { return null; }
}
function write(id: string, taskId: string | null) {
  try {
    if (taskId) sessionStorage.setItem(key(id), taskId);
    else sessionStorage.removeItem(key(id));
  } catch { /* sessionStorage may be blocked */ }
}

export const useFocus = create<FocusState>((set, get) => ({
  userId: null,
  taskId: null,
  setUser: (id) => {
    if (get().userId === id) return;
    set({ userId: id, taskId: id ? read(id) : null });
  },
  setTask: (taskId) => {
    const id = get().userId;
    if (id) write(id, taskId);
    set({ taskId });
  }
}));
