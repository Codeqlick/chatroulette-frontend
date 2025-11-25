import { create } from 'zustand';

export interface BanDetails {
  reason?: string;
  bannedAt?: string;
  bannedUntil?: string;
  supportMessage?: string;
}

interface BanState {
  isBanned: boolean;
  email?: string;
  details?: BanDetails;
  setBanInfo: (info: { email?: string; details?: BanDetails }) => void;
  clearBanInfo: () => void;
}

export const useBanStore = create<BanState>((set) => ({
  isBanned: false,
  email: undefined,
  details: undefined,
  setBanInfo: ({ email, details }) => {
    set({
      isBanned: true,
      email: email ?? undefined,
      details,
    });
  },
  clearBanInfo: () => {
    set({
      isBanned: false,
      email: undefined,
      details: undefined,
    });
  },
}));
