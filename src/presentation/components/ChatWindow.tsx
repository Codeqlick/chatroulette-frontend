import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@application/stores/chat-store';
import { useAuthStore } from '@application/stores/auth-store';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { sessionService } from '@infrastructure/api/session-service';
import { WEBSOCKET_EVENTS, API_CONSTANTS } from '@config/constants';
import { useWebRTC } from '../hooks/useWebRTC';
import { useToast } from '../hooks/useToast';
import { Button } from './Button';
import { ReportModal } from './ReportModal';
import { UserProfileModal } from './UserProfileModal';
import { AppHeader } from './AppHeader';
import { ThemeToggle } from './ThemeToggle';
import { ToastContainer } from './Toast';
import { UserProfileCard } from './UserProfileCard';
import { blockService } from '@infrastructure/api/block-service';
import { likeService } from '@infrastructure/api/like-service';
import { logger } from '@infrastructure/logging/frontend-logger';

interface ChatWindowProps {
  sessionId: string;
  partner: { username: string; name: string; avatar: string | null };
}

export function ChatWindow({ sessionId, partner }: ChatWindowProps): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toasts, showError, showWarning, removeToast } = useToast();
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [partnerLikes, setPartnerLikes] = useState<number>(0);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [isLiking, setIsLiking] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopVideoRef = useRef<(() => void) | null>(null);
  const isEndingRef = useRef<boolean>(false);
  const menuContainerMobileRef = useRef<HTMLDivElement>(null);
  const menuContainerDesktopRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    addMessage,
    updateMessage,
    setTyping,
    clearSession,
    loadMessages,
    isLoadingMessages,
    setLoadingMessages,
  } = useChatStore();

  // Initialize messagesRef after messages is available, and keep it updated
  const messagesRef = useRef(messages);
  const {
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    isVideoEnabled,
    isAudioEnabled,
    connectionState,
    connectionQuality,
    availableDevices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    startVideo,
    stopVideo,
    toggleVideo,
    toggleAudio,
    changeVideoDevice,
    changeAudioDevice,
    error: webRTCError,
  } = useWebRTC(sessionId);

  // Cleanup function to stop all WebRTC connections and media
  const cleanupWebRTC = useCallback((): void => {
    // Stop local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    // Stop remote stream tracks
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    // Emit disconnect event via WebSocket
    if (sessionId) {
      try {
        webSocketService.emit(WEBSOCKET_EVENTS.VIDEO_END, { sessionId });
      } catch (error) {
        logger.warn('Error emitting video end event', { error, sessionId });
      }
    }
  }, [localStream, remoteStream, localVideoRef, remoteVideoRef, sessionId]);

  // Store stopVideo in ref to avoid dependency issues
  useEffect(() => {
    stopVideoRef.current = stopVideo;
  }, [stopVideo]);

  // Load message history when component mounts or sessionId changes
  useEffect(() => {
    const loadMessageHistory = async (): Promise<void> => {
      if (!sessionId) {
        return;
      }

      try {
        setLoadingMessages(true);
        const response = await sessionService.getSessionMessages(sessionId, 50);

        // Convert API messages to ChatMessage format
        const chatMessages = response.messages.map((msg) => ({
          id: msg.id,
          sessionId: msg.sessionId,
          senderId: msg.senderId,
          senderUsername: msg.senderUsername,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          delivered: msg.delivered,
          read: msg.read,
        }));

        loadMessages(chatMessages);

        // Scroll to bottom after messages are loaded
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } catch (error) {
        logger.error('Error loading message history', { error, sessionId });
        // Don't show error to user, just continue without history
      } finally {
        setLoadingMessages(false);
      }
    };

    loadMessageHistory();
  }, [sessionId, loadMessages, setLoadingMessages]);

  useEffect(() => {
    // Join session room - ensure WebSocket is connected first
    if (webSocketService.isConnected()) {
      webSocketService.joinRoom(sessionId);
      logger.debug('Joined session room', { sessionId });
    } else {
      logger.warn('WebSocket not connected, waiting to join room', { sessionId });
      // Wait for WebSocket to connect, then join room
      const checkConnection = setInterval(() => {
        if (webSocketService.isConnected()) {
          webSocketService.joinRoom(sessionId);
          logger.debug('Joined session room after connection', { sessionId });
          clearInterval(checkConnection);
        }
      }, 500);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkConnection);
      }, 10000);

      return () => clearInterval(checkConnection);
    }

    // Listen for messages
    const handleMessage = (...args: unknown[]): void => {
      const data = args[0] as {
        sessionId: string;
        messageId: string;
        senderId: string;
        senderUsername: string;
        message: string;
        timestamp: number;
      };
      if (data.sessionId === sessionId) {
        // Check if message already exists by ID (most reliable) or by content/timestamp
        const messageExistsById = messagesRef.current.some((msg) => msg.id === data.messageId);

        const messageExistsByContent = messagesRef.current.some(
          (msg) =>
            msg.content === data.message &&
            msg.senderId === data.senderId &&
            Math.abs(msg.timestamp.getTime() - data.timestamp) < 2000 // Within 2 seconds
        );

        if (!messageExistsById && !messageExistsByContent) {
          addMessage({
            id: data.messageId,
            sessionId: data.sessionId,
            senderId: data.senderId,
            senderUsername: data.senderUsername,
            content: data.message,
            timestamp: new Date(data.timestamp),
            delivered: true,
            read: false,
          });
        }
      }
    };

    const handleTyping = (...args: unknown[]): void => {
      const data = args[0] as {
        sessionId: string;
        isTyping: boolean;
      };
      if (data.sessionId === sessionId) {
        setTyping(data.isTyping);
      }
    };

    const handleRoomReady = (...args: unknown[]): void => {
      const data = args[0] as {
        sessionId: string;
      };
      if (data.sessionId === sessionId) {
        logger.debug('Room ready, both users in room', { sessionId });
        setRoomReady(true);
      }
    };

    const handleMessageDelivered = (...args: unknown[]): void => {
      const data = args[0] as {
        messageId: string;
        deliveredAt: number;
      };
      // Update message delivery status
      updateMessage(data.messageId, {
        delivered: true,
      });
      logger.debug('Message delivered', { messageId: data.messageId, sessionId });
    };

    const handlePartnerDisconnected = (...args: unknown[]): void => {
      const data = args[0] as {
        sessionId: string;
        reason: string;
      };
      if (data.sessionId === sessionId) {
        logger.warn('Partner disconnected', { reason: data.reason, sessionId });
        const reasonMessages: Record<string, string> = {
          connection_lost: 'El compañero perdió la conexión',
          user_left: 'El compañero abandonó la sesión',
          timeout: 'El compañero no respondió',
        };
        const message = reasonMessages[data.reason] || 'El compañero se desconectó';
        showWarning(message);
      }
    };

    const handleError = (...args: unknown[]): void => {
      const error = args[0] as {
        code: string;
        message: string;
        eventId?: string;
      };
      logger.error('WebSocket error', { error, sessionId });

      // Handle rate limit errors with a more user-friendly message
      if (
        error.code === 'RATE_LIMIT_EXCEEDED' ||
        error.message.toLowerCase().includes('rate limit')
      ) {
        if (error.message.toLowerCase().includes('video offers')) {
          showWarning(
            'Has enviado demasiadas solicitudes de video. Por favor, espera un momento antes de intentar nuevamente.'
          );
        } else {
          showWarning('Demasiadas solicitudes. Por favor, espera un momento.');
        }
      } else {
        showError(`Error de conexión: ${error.message}`);
      }
    };

    webSocketService.on(WEBSOCKET_EVENTS.CHAT_MESSAGE_RECEIVED, handleMessage);
    webSocketService.on(WEBSOCKET_EVENTS.SESSION_PARTNER_TYPING, handleTyping);
    webSocketService.on(WEBSOCKET_EVENTS.ROOM_READY, handleRoomReady);
    webSocketService.on('chat:message:delivered', handleMessageDelivered);
    webSocketService.on(WEBSOCKET_EVENTS.SESSION_PARTNER_DISCONNECTED, handlePartnerDisconnected);
    webSocketService.onError(handleError);

    return () => {
      webSocketService.off(WEBSOCKET_EVENTS.CHAT_MESSAGE_RECEIVED, handleMessage);
      webSocketService.off(WEBSOCKET_EVENTS.SESSION_PARTNER_TYPING, handleTyping);
      webSocketService.off(WEBSOCKET_EVENTS.ROOM_READY, handleRoomReady);
      webSocketService.off('chat:message:delivered', handleMessageDelivered);
      webSocketService.off(
        WEBSOCKET_EVENTS.SESSION_PARTNER_DISCONNECTED,
        handlePartnerDisconnected
      );
      webSocketService.offError(handleError);
      webSocketService.leaveRoom(sessionId);
      setRoomReady(false);
      // Stop video when component unmounts or session changes
      if (stopVideoRef.current) {
        stopVideoRef.current();
      }
    };
  }, [sessionId, addMessage, setTyping, updateMessage, showWarning, showError, setRoomReady]);

  // Keep messages ref updated
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    // Use setTimeout to ensure DOM is updated before scrolling
    const timeoutId = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages]);

  // Auto-start video when room is ready and both users are in room
  // Use a random delay to prevent both users from starting at the same time
  useEffect(() => {
    if (sessionId && !localStream && roomReady) {
      // Random delay between 500ms and 2000ms to prevent race condition
      // The user with shorter delay will start the offer, the other will wait for it
      const randomDelay = 500 + Math.random() * 1500;
      logger.debug(`Room ready, starting video in ${Math.round(randomDelay)}ms`, {
        sessionId,
        delay: Math.round(randomDelay),
      });

      const timer = setTimeout(() => {
        logger.debug('Starting video after room ready', { sessionId });
        startVideo().catch((err) => {
          logger.error('Error auto-starting video', { error: err, sessionId });
        });
      }, randomDelay);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [sessionId, roomReady, localStream, startVideo]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;

      // Check both mobile and desktop menu containers
      const isClickInsideMobile = menuContainerMobileRef.current?.contains(target);
      const isClickInsideDesktop = menuContainerDesktopRef.current?.contains(target);

      if (!isClickInsideMobile && !isClickInsideDesktop) {
        logger.debug('Click outside menu, closing menu');
        setIsMenuOpen(false);
      }
    };

    // Register listener after a small delay to avoid capturing the button click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, false);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside, false);
    };
  }, [isMenuOpen]);

  const handleSendMessage = (): void => {
    if (!message.trim() || message.length > API_CONSTANTS.MAX_MESSAGE_LENGTH) {
      return;
    }

    const messageContent = message.trim();
    const timestamp = Date.now();

    // Emit message to server - don't add locally, wait for server confirmation
    webSocketService.emit(WEBSOCKET_EVENTS.CHAT_MESSAGE, {
      sessionId,
      message: messageContent,
      timestamp,
    });

    // Clear input immediately for better UX
    setMessage('');

    // The message will be added when we receive CHAT_MESSAGE_RECEIVED from server
    // This prevents duplicates
  };

  const handleTyping = (): void => {
    if (!isTyping) {
      setIsTyping(true);
      webSocketService.emit(WEBSOCKET_EVENTS.SESSION_TYPING, {
        sessionId,
        isTyping: true,
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      webSocketService.emit(WEBSOCKET_EVENTS.SESSION_TYPING, {
        sessionId,
        isTyping: false,
      });
    }, 3000);
  };

  const handleMenuToggle = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    logger.debug('Menu toggle clicked', { currentState: isMenuOpen });
    // Use a direct state update without setTimeout
    const newState = !isMenuOpen;
    logger.debug('Setting menu state', { newState });
    setIsMenuOpen(newState);
  };

  const handleEndSession = async (): Promise<void> => {
    // Prevent multiple simultaneous calls
    if (isEndingRef.current) {
      return;
    }

    isEndingRef.current = true;
    setIsEnding(true);
    try {
      // Cleanup WebRTC: stop all video/audio tracks, close connections
      cleanupWebRTC();

      // Also call stopVideo for additional cleanup
      stopVideo();

      // Stop any active matching before ending session
      try {
        const { matchingService } = await import('@infrastructure/api/matching-service');
        await matchingService.stop().catch((err) => {
          logger.warn('Error stopping matching', { error: err });
          // Continue even if stopping matching fails
        });
      } catch (err) {
        logger.warn('Error importing matching service', { error: err });
      }

      // Add timeout for session ending request
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout al terminar sesión')), 10000);
      });

      await Promise.race([sessionService.endSession(sessionId), timeoutPromise]);

      // Clear session state
      clearSession();

      // Navigate back to videochat page - this will trigger reconnection logic
      navigate('/videochat');
    } catch (error) {
      logger.error('Error ending session', { error, sessionId });
      isEndingRef.current = false;
      setIsEnding(false);
      // Show error message to user
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Error al terminar sesión. Por favor, intenta nuevamente.';
      showError(errorMessage);
    }
  };

  const handleLike = async (): Promise<void> => {
    if (isLiking || !sessionId || !partner.username) {
      return;
    }

    setIsLiking(true);
    const previousLikes = partnerLikes;
    const previousHasLiked = hasLiked;

    try {
      if (hasLiked) {
        // Quitar like
        setPartnerLikes(Math.max(0, previousLikes - 1));
        setHasLiked(false);
        await likeService.unlikeUser(sessionId);
      } else {
        // Dar like usando username del partner
        setPartnerLikes(previousLikes + 1);
        setHasLiked(true);
        await likeService.likeUser(sessionId, undefined, partner.username);
      }

      // Recargar contador real y estado del like desde el servidor para mantener sincronización
      try {
        const [likeStatus, sessionLikes] = await Promise.all([
          likeService.getLikeStatus(sessionId).catch(() => ({ hasLiked: false })),
          likeService.getSessionLikes(sessionId).catch(() => ({ likes: [] })),
        ]);

        // Count likes in this session (will need backend update to filter by username)
        const sessionLikesCount = sessionLikes.likes.length;

        logger.debug('Reloaded after like toggle', {
          partnerUsername: partner.username,
          sessionId: sessionId,
          sessionLikesCount: sessionLikesCount,
          hasLiked: likeStatus.hasLiked,
          previousLikes: previousLikes,
          previousHasLiked: previousHasLiked,
        });

        setPartnerLikes(sessionLikesCount);
        setHasLiked(likeStatus.hasLiked || false);
      } catch (statsError) {
        logger.error('Error reloading likes count and status', { error: statsError, sessionId });
        // Si falla, mantener el valor optimista
      }
    } catch (error) {
      // Revert optimistic update on error
      setPartnerLikes(previousLikes);
      setHasLiked(previousHasLiked);

      logger.error('Error toggling like', { error, sessionId });
      const errorMessage =
        error instanceof Error
          ? error.message
          : hasLiked
            ? 'Error al quitar like. Por favor, intenta nuevamente.'
            : 'Error al dar like. Por favor, intenta nuevamente.';
      showError(errorMessage);
    } finally {
      setIsLiking(false);
    }
  };

  // Load initial likes count and like status when component mounts or partner/session changes
  useEffect(() => {
    const loadInitialData = async (): Promise<void> => {
      if (!partner.username || !sessionId) {
        return;
      }

      try {
        // Load like status and count likes for current session only
        const [likeStatus, sessionLikes] = await Promise.all([
          likeService.getLikeStatus(sessionId).catch(() => ({ hasLiked: false })),
          likeService.getSessionLikes(sessionId).catch(() => ({ likes: [] })),
        ]);

        // Count likes in this session (will need backend update to filter by username)
        const sessionLikesCount = sessionLikes.likes.length;

        logger.debug('Loaded initial data', {
          partnerUsername: partner.username,
          sessionId: sessionId,
          sessionLikesCount: sessionLikesCount,
          hasLiked: likeStatus.hasLiked,
          totalLikesInSession: sessionLikes.likes.length,
        });

        setPartnerLikes(sessionLikesCount);
        setHasLiked(likeStatus.hasLiked || false);
      } catch (error) {
        logger.error('Error loading initial data', { error, sessionId });
        // Don't show error to user, just continue with defaults
      }
    };

    loadInitialData();
  }, [partner.username, sessionId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors w-full overflow-hidden">
      {/* Header - Mobile First */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-all duration-200 sticky top-0 z-[100] flex-shrink-0 shadow-md">
        {/* Mobile Header */}
        <div className="lg:hidden px-3 sm:px-4 py-2.5 sm:py-3 flex justify-between items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white mr-2 flex-shrink-0">
              Chatroulette
            </h1>
            {/* Partner Profile Card */}
            <UserProfileCard
              name={partner.name}
              username={partner.username}
              avatar={partner.avatar}
              connectionState={connectionState}
              connectionQuality={connectionQuality || undefined}
              size="sm"
              showUsername={true}
              showConnectionStatus={true}
              onClick={() => setIsProfileModalOpen(true)}
            />
          </div>
          <div className="flex gap-2 items-center flex-shrink-0">
            {/* Media Controls Group */}
            <div className="flex gap-1.5 items-center bg-gray-100 dark:bg-gray-700/50 px-1.5 py-1 rounded-lg shadow-sm">
              <button
                onClick={toggleVideo}
                className={`relative p-2 rounded-lg transition-all flex-shrink-0 transform hover:scale-105 active:scale-95 ${
                  isVideoEnabled
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                }`}
                aria-label={isVideoEnabled ? 'Desactivar video' : 'Activar video'}
                title={
                  isVideoEnabled
                    ? 'Desactivar video (Clic para activar)'
                    : 'Activar video (Clic para desactivar)'
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isVideoEnabled ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  )}
                </svg>
                {!isVideoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-0.5 bg-white transform rotate-45"></div>
                  </div>
                )}
              </button>
              <button
                onClick={toggleAudio}
                className={`relative p-2 rounded-lg transition-all flex-shrink-0 transform hover:scale-105 active:scale-95 ${
                  isAudioEnabled
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                }`}
                aria-label={isAudioEnabled ? 'Desactivar audio' : 'Activar audio'}
                title={
                  isAudioEnabled
                    ? 'Desactivar audio (Clic para activar)'
                    : 'Activar audio (Clic para desactivar)'
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isAudioEnabled ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  ) : (
                    <>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                      />
                    </>
                  )}
                </svg>
                {!isAudioEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-0.5 bg-white transform rotate-45"></div>
                  </div>
                )}
              </button>
            </div>
            {/* Separator */}
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
            {/* Action Controls Group */}
            <div className="flex gap-1.5 items-center">
              <Button
                variant="danger"
                size="sm"
                onClick={handleEndSession}
                isLoading={isEnding}
                className="text-xs px-2.5 py-1.5 flex-shrink-0 transform hover:scale-105 active:scale-95 transition-transform"
                title="Terminar sesión y buscar nuevo chat"
              >
                Siguiente
              </Button>
              <div className="relative menu-container flex-shrink-0" ref={menuContainerMobileRef}>
                <button
                  type="button"
                  onClick={handleMenuToggle}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors pointer-events-auto"
                  aria-label="Menú"
                  aria-expanded={isMenuOpen}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                    />
                  </svg>
                </button>
                {isMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-[200] border border-gray-200 dark:border-gray-700">
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Opciones
                        </span>
                        <ThemeToggle />
                      </div>
                      {/* Video Device Selector */}
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 px-2">
                          Cámara:
                        </div>
                        {availableDevices
                          .filter((d) => d.kind === 'videoinput')
                          .map((device) => (
                            <button
                              key={device.deviceId}
                              onClick={() => {
                                changeVideoDevice(device.deviceId);
                                setIsMenuOpen(false);
                              }}
                              className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                                selectedVideoDeviceId === device.deviceId
                                  ? 'bg-primary-600 text-white'
                                  : 'text-gray-900 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              {device.label}
                            </button>
                          ))}
                      </div>
                      {/* Audio Device Selector */}
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 px-2">
                          Micrófono:
                        </div>
                        {availableDevices
                          .filter((d) => d.kind === 'audioinput')
                          .map((device) => (
                            <button
                              key={device.deviceId}
                              onClick={() => {
                                changeAudioDevice(device.deviceId);
                                setIsMenuOpen(false);
                              }}
                              className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                                selectedAudioDeviceId === device.deviceId
                                  ? 'bg-primary-600 text-white'
                                  : 'text-gray-900 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              {device.label}
                            </button>
                          ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              await blockService.blockUser(partner.username);
                              await handleEndSession();
                            } catch (error) {
                              logger.error('Error blocking user', {
                                error,
                                username: partner.username,
                              });
                              showError('Error al bloquear usuario. Intenta nuevamente.');
                            }
                            setIsMenuOpen(false);
                          }}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-xs"
                        >
                          Bloquear
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setIsReportModalOpen(true);
                            setIsMenuOpen(false);
                          }}
                          className="w-full bg-red-600 hover:bg-red-700 text-xs"
                        >
                          Reportar
                        </Button>
                        {user?.role === 'ADMIN' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              navigate('/admin');
                              setIsMenuOpen(false);
                            }}
                            className="w-full text-xs"
                          >
                            Panel Admin
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex px-5 xl:px-6 py-3.5 xl:py-4 justify-between items-center min-w-0 gap-4">
          <div className="flex items-center gap-3 xl:gap-4 min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex-shrink-0">
              Chatroulette
            </h1>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 flex-shrink-0"></div>
            {/* Partner Profile Card */}
            <UserProfileCard
              name={partner.name}
              username={partner.username}
              avatar={partner.avatar}
              connectionState={connectionState}
              connectionQuality={connectionQuality || undefined}
              size="md"
              showUsername={true}
              showConnectionStatus={true}
              onClick={() => setIsProfileModalOpen(true)}
            />
          </div>
          {/* App Header - User menu */}
          <AppHeader
            className="flex-shrink-0 border-0 shadow-none bg-transparent"
            showLogo={false}
          />
          <div className="flex gap-2 xl:gap-3 items-center flex-shrink-0 ml-2 xl:ml-4">
            {/* Media Controls Group */}
            <div className="flex gap-2 items-center bg-gray-100 dark:bg-gray-700/50 px-2 py-1.5 rounded-lg shadow-sm">
              <button
                onClick={toggleVideo}
                className={`relative p-2.5 rounded-lg transition-all flex-shrink-0 transform hover:scale-105 active:scale-95 ${
                  isVideoEnabled
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                }`}
                aria-label={isVideoEnabled ? 'Desactivar video' : 'Activar video'}
                title={
                  isVideoEnabled
                    ? 'Desactivar video (Clic para activar)'
                    : 'Activar video (Clic para desactivar)'
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 lg:h-5 lg:w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isVideoEnabled ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  )}
                </svg>
                {!isVideoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-0.5 bg-white transform rotate-45"></div>
                  </div>
                )}
              </button>
              <button
                onClick={toggleAudio}
                className={`relative p-2.5 rounded-lg transition-all flex-shrink-0 transform hover:scale-105 active:scale-95 ${
                  isAudioEnabled
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                }`}
                aria-label={isAudioEnabled ? 'Desactivar audio' : 'Activar audio'}
                title={
                  isAudioEnabled
                    ? 'Desactivar audio (Clic para activar)'
                    : 'Activar audio (Clic para desactivar)'
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 lg:h-5 lg:w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isAudioEnabled ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  ) : (
                    <>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                      />
                    </>
                  )}
                </svg>
                {!isAudioEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-0.5 bg-white transform rotate-45"></div>
                  </div>
                )}
              </button>
            </div>
            {/* Separator */}
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>
            {/* Action Controls Group */}
            <div className="flex gap-2 items-center">
              <Button
                variant="danger"
                size="sm"
                onClick={handleEndSession}
                isLoading={isEnding}
                className="text-xs lg:text-sm px-2 lg:px-3 py-1 lg:py-1.5 flex-shrink-0 transform hover:scale-105 active:scale-95 transition-transform"
                title="Terminar sesión y buscar nuevo chat"
              >
                Siguiente
              </Button>
              <div className="relative menu-container flex-shrink-0" ref={menuContainerDesktopRef}>
                <button
                  type="button"
                  onClick={handleMenuToggle}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors pointer-events-auto"
                  aria-label="Menú"
                  aria-expanded={isMenuOpen}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 lg:h-5 lg:w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                    />
                  </svg>
                </button>
                {isMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-[200] border border-gray-200 dark:border-gray-700">
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Opciones
                        </span>
                        <ThemeToggle />
                      </div>
                      {/* Video Device Selector */}
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 px-2">
                          Cámara:
                        </div>
                        {availableDevices
                          .filter((d) => d.kind === 'videoinput')
                          .map((device) => (
                            <button
                              key={device.deviceId}
                              onClick={() => {
                                changeVideoDevice(device.deviceId);
                                setIsMenuOpen(false);
                              }}
                              className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                                selectedVideoDeviceId === device.deviceId
                                  ? 'bg-primary-600 text-white'
                                  : 'text-gray-900 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              {device.label}
                            </button>
                          ))}
                      </div>
                      {/* Audio Device Selector */}
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 px-2">
                          Micrófono:
                        </div>
                        {availableDevices
                          .filter((d) => d.kind === 'audioinput')
                          .map((device) => (
                            <button
                              key={device.deviceId}
                              onClick={() => {
                                changeAudioDevice(device.deviceId);
                                setIsMenuOpen(false);
                              }}
                              className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                                selectedAudioDeviceId === device.deviceId
                                  ? 'bg-primary-600 text-white'
                                  : 'text-gray-900 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              {device.label}
                            </button>
                          ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              if (!partner.username) {
                                showError(
                                  'No se puede bloquear: el nombre de usuario no está disponible'
                                );
                                setIsMenuOpen(false);
                                return;
                              }
                              await blockService.blockUser(partner.username);
                              await handleEndSession();
                              setIsMenuOpen(false);
                            } catch (error) {
                              logger.error('Error blocking user', {
                                error,
                                username: partner.username,
                              });
                              showError('Error al bloquear usuario. Intenta nuevamente.');
                              setIsMenuOpen(false);
                            }
                          }}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-xs"
                        >
                          Bloquear
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setIsReportModalOpen(true);
                            setIsMenuOpen(false);
                          }}
                          className="w-full bg-red-600 hover:bg-red-700 text-xs"
                        >
                          Reportar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WebRTC Error Display */}
      {webRTCError && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 mx-4 mt-2 rounded-lg text-sm">
          <p className="font-medium">Error de conexión de video: {webRTCError.message}</p>
        </div>
      )}

      {/* Main Content Area - Mobile First */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-0 p-0 lg:p-0 bg-gray-100 dark:bg-gray-800 transition-colors overflow-hidden min-h-0">
        {/* Videos Section - Sección izquierda más grande (estilo Flingster) */}
        <div className="flex flex-col gap-4 w-full lg:flex-[2] lg:h-full p-3 sm:p-4 lg:p-6 items-center justify-center">
          {/* Local Video */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] shadow-lg w-full max-w-md lg:max-w-lg">
            {localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <Button onClick={startVideo} size="lg" className="text-sm lg:text-base">
                  Iniciar Video
                </Button>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs lg:text-sm text-white font-medium">
              Tú
            </div>
          </div>
          {/* Remote Video */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] shadow-lg w-full max-w-md lg:max-w-lg">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[200px] text-gray-400 text-sm lg:text-base">
                Esperando video...
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs lg:text-sm text-white font-medium truncate max-w-[80%]">
              {partner.name}
            </div>
          </div>
          {/* Like Button and Stop Button - Solo en móvil, en desktop están en el header */}
          <div className="flex flex-col gap-3 justify-center items-center lg:hidden">
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 ${
                hasLiked
                  ? 'bg-pink-500 dark:bg-pink-600 text-white hover:bg-pink-600 dark:hover:bg-pink-700 cursor-pointer'
                  : isLiking
                    ? 'bg-gray-400 dark:bg-gray-600 text-white cursor-wait'
                    : 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 hover:bg-pink-200 dark:hover:bg-pink-900/50 border border-pink-300 dark:border-pink-700 cursor-pointer'
              } shadow-md`}
              title={hasLiked ? 'Quitar like' : 'Dar like a este usuario'}
            >
              {isLiking ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-5 w-5 ${hasLiked ? 'fill-current' : ''}`}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={hasLiked ? 0 : 2}
                  fill={hasLiked ? 'currentColor' : 'none'}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  />
                </svg>
              )}
              <span className="font-semibold text-sm lg:text-base">{partnerLikes}</span>
            </button>
            <Button
              variant="danger"
              size="lg"
              onClick={handleEndSession}
              isLoading={isEnding}
              disabled={isEnding}
              className="w-full max-w-xs font-bold text-base lg:text-lg px-6 py-3 shadow-lg transform hover:scale-105 active:scale-95 transition-transform"
              title="Terminar videochat, cerrar conexión WebRTC y buscar nuevo usuario"
            >
              {isEnding ? 'Terminando...' : '⏹️ Detener Videochat'}
            </Button>
          </div>
        </div>

        {/* Chat Section - Sección derecha más estrecha (estilo Flingster) */}
        <div className="flex flex-col w-full lg:flex-[1] lg:max-w-md lg:h-full bg-white dark:bg-gray-900 lg:border-l border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-4 transition-colors min-h-0 relative">
            {isLoadingMessages ? (
              <div className="text-center text-gray-600 dark:text-gray-400 py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mx-auto mb-2"></div>
                <p className="text-sm">Cargando mensajes...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center text-gray-600 dark:text-gray-400 text-sm lg:text-base">
                No hay mensajes aún. ¡Empieza la conversación!
              </div>
            ) : (
              <div className="space-y-3 lg:space-y-4">
                {messages.map((msg) => {
                  // Use senderUsername to determine if message is from current user
                  const isCurrentUser = user?.username
                    ? msg.senderUsername === user.username
                    : false;
                  return (
                    <div
                      key={msg.id}
                      className={`animate-slide-up ${
                        isCurrentUser ? 'flex justify-end' : 'flex justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[75%] sm:max-w-xs lg:max-w-md px-4 py-2.5 rounded-lg transition-colors ${
                          isCurrentUser
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <p className="text-sm lg:text-base break-words">{msg.content}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <p
                            className={`text-xs ${
                              isCurrentUser
                                ? 'text-primary-100'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </p>
                          {isCurrentUser && (
                            <span
                              className="text-xs ml-2"
                              title={msg.delivered ? 'Entregado' : 'Enviando...'}
                            >
                              {msg.delivered ? '✓' : '○'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={messagesEndRef} className="h-0" />
          </div>

          {/* Input Area */}
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 lg:p-4 border-t border-gray-200 dark:border-gray-700 transition-colors flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Escribe un mensaje..."
                maxLength={API_CONSTANTS.MAX_MESSAGE_LENGTH}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 text-sm lg:text-base bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!message.trim()}
                size="md"
                className="text-sm lg:text-base px-3 sm:px-4 lg:px-6 flex-shrink-0"
              >
                Enviar
              </Button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 sm:mt-2 text-right">
              {message.length}/{API_CONSTANTS.MAX_MESSAGE_LENGTH}
            </p>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      <ReportModal
        sessionId={sessionId}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onReportSubmitted={async () => {
          // Report submitted successfully, end session and redirect
          try {
            await handleEndSession();
          } catch (error) {
            logger.error('Error ending session after report', { error, sessionId });
            // Still redirect even if ending session fails
            clearSession();
            navigate('/videochat');
          }
        }}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        partner={partner}
        connectionState={connectionState}
        connectionQuality={connectionQuality || undefined}
        sessionId={sessionId}
        onReport={() => setIsReportModalOpen(true)}
        onBlock={async () => {
          try {
            if (!partner.username) {
              showError('No se puede bloquear: el nombre de usuario no está disponible');
              return;
            }
            await blockService.blockUser(partner.username);
            await handleEndSession();
          } catch (error) {
            logger.error('Error blocking user', { error, username: partner.username });
            showError('Error al bloquear usuario. Intenta nuevamente.');
          }
        }}
        partnerLikes={partnerLikes}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
