import { create } from 'zustand';
import { ChatMessage } from '@domain/entities/session';

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  partner: { username: string; name: string; avatar: string | null } | null;
  isTyping: boolean;
  isLoadingMessages: boolean;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  setSession: (sessionId: string, partner: { username: string; name: string; avatar: string | null }) => void;
  clearSession: () => void;
  setTyping: (isTyping: boolean) => void;
  loadMessages: (messages: ChatMessage[]) => void;
  setLoadingMessages: (loading: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  sessionId: null,
  partner: null,
  isTyping: false,
  isLoadingMessages: false,
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  updateMessage: (messageId, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    })),
  setSession: (sessionId, partner) =>
    set({
      sessionId,
      partner,
      messages: [],
      isLoadingMessages: false,
    }),
  clearSession: () =>
    set({
      sessionId: null,
      partner: null,
      messages: [],
      isTyping: false,
      isLoadingMessages: false,
    }),
  setTyping: (isTyping) => set({ isTyping }),
  loadMessages: (messages) =>
    set({
      messages,
      isLoadingMessages: false,
    }),
  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
}));

