export const API_CONSTANTS = {
  MAX_MESSAGE_LENGTH: 1000,
  HEARTBEAT_INTERVAL_MS: 30000,
  RECONNECT_DELAY_MS: 1000,
  MAX_RECONNECT_ATTEMPTS: 5,
  WEBRTC_RETRY_MAX_ATTEMPTS: 3,
  WEBRTC_RETRY_INITIAL_DELAY_MS: 1000,
  WEBRTC_RETRY_MAX_DELAY_MS: 5000,
} as const;

export const WEBSOCKET_EVENTS = {
  // Client -> Server
  CHAT_MESSAGE: 'chat:message',
  VIDEO_OFFER: 'video:offer',
  VIDEO_ANSWER: 'video:answer',
  VIDEO_ICE_CANDIDATE: 'video:ice-candidate',
  VIDEO_END: 'video:end',
  SESSION_TYPING: 'session:typing',
  SESSION_HEARTBEAT: 'session:heartbeat',
  // Server -> Client
  MATCH_FOUND: 'match:found',
  MATCH_TIMEOUT: 'match:timeout',
  CHAT_MESSAGE_RECEIVED: 'chat:message',
  VIDEO_OFFER_RECEIVED: 'video:offer',
  VIDEO_ANSWER_RECEIVED: 'video:answer',
  VIDEO_ICE_CANDIDATE_RECEIVED: 'video:ice-candidate',
  VIDEO_ENDED: 'video:ended',
  SESSION_PARTNER_TYPING: 'session:partner:typing',
  SESSION_PARTNER_DISCONNECTED: 'session:partner:disconnected',
  SESSION_ENDED: 'session:ended',
  SERVER_HEARTBEAT: 'server:heartbeat',
  ROOM_READY: 'room:ready',
  ERROR: 'error',
} as const;

