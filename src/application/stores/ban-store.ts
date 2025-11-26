import { create } from 'zustand';

export interface BanDetails {
  reason?: string | undefined;
  bannedAt?: string | undefined;
  bannedUntil?: string | undefined;
  supportMessage?: string | undefined;
}

interface BanState {
  isBanned: boolean;
  email?: string | undefined;
  details?: BanDetails | undefined;
  setBanInfo: (info: { email?: string | undefined; details?: BanDetails | undefined }) => void;
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
