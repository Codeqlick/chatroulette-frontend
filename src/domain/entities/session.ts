export interface Session {
  id: string;
  user1Id: string;
  user2Id: string;
  status: 'ACTIVE' | 'ENDED' | 'REPORTED';
  startedAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderUsername: string;
  content: string;
  timestamp: Date;
  delivered: boolean;
  read: boolean;
}
