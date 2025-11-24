import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useChatStore } from '@application/stores/chat-store';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { sessionService } from '@infrastructure/api/session-service';
import { WEBSOCKET_EVENTS } from '@config/constants';
import { ChatWindow } from '../components/ChatWindow';

export function ChatPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { setSession, partner, clearSession } = useChatStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate('/videochat');
      return;
    }

    // If partner is already in store, no need to fetch
    if (partner) {
      setIsLoading(false);
    } else {
      // Fetch session details from backend
      const fetchSessionDetails = async (): Promise<void> => {
        try {
          const details = await sessionService.getSessionDetails(sessionId);
          setSession(details.sessionId, details.partner);
          setIsLoading(false);
        } catch (err) {
          // Handle 409 (SESSION_NOT_ACTIVE) as silent redirect - session already ended
          if (err instanceof AxiosError && err.response?.status === 409) {
            console.log('Session not active, redirecting to videochat');
            setIsLoading(false);
            clearSession();
            navigate('/videochat');
            return;
          }

          // Show error for other cases
          console.error('Error fetching session details:', err);
          setError('No se pudo cargar la sesión. Por favor, intenta nuevamente.');
          setIsLoading(false);
          // Redirect to videochat after a delay
          setTimeout(() => {
            navigate('/videochat');
          }, 3000);
        }
      };

      fetchSessionDetails();
    }

    // Listen for match found to set session (in case it arrives later)
    const handleMatchFound = (...args: unknown[]): void => {
      const data = args[0] as {
        sessionId: string;
        partner: { id: string; name: string; avatar: string | null };
      };
      if (data.sessionId === sessionId) {
        setSession(data.sessionId, data.partner);
        setIsLoading(false);
      }
    };

    // Listen for session ended
    const handleSessionEnded = (...args: unknown[]): void => {
      const data = args[0] as { sessionId: string };
      if (data.sessionId === sessionId) {
        clearSession();
        navigate('/videochat');
      }
    };

    webSocketService.on(WEBSOCKET_EVENTS.MATCH_FOUND, handleMatchFound);
    webSocketService.on(WEBSOCKET_EVENTS.SESSION_ENDED, handleSessionEnded);

    return () => {
      webSocketService.off(WEBSOCKET_EVENTS.MATCH_FOUND, handleMatchFound);
      webSocketService.off(WEBSOCKET_EVENTS.SESSION_ENDED, handleSessionEnded);
    };
  }, [sessionId, navigate, setSession, clearSession, partner]);

  if (!sessionId || isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Cargando sesión...</p>
          {error && (
            <p className="text-red-500 mt-4">{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4 text-red-500">
            {error || 'No se pudo cargar la sesión'}
          </p>
          <button
            onClick={() => navigate('/videochat')}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return <ChatWindow sessionId={sessionId} partner={partner} />;
}

