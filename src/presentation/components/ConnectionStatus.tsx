import { useEffect, useState } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';
export type ConnectionQuality = 'good' | 'medium' | 'poor';

interface ConnectionStatusProps {
  state: ConnectionState;
  quality?: ConnectionQuality;
  className?: string;
}

export function ConnectionStatus({
  state,
  quality,
  className = '',
}: ConnectionStatusProps): JSX.Element {
  const [displayText, setDisplayText] = useState('');
  const [colorClass, setColorClass] = useState('');

  useEffect(() => {
    switch (state) {
      case 'connecting':
        setDisplayText('Conectando...');
        setColorClass('text-yellow-500');
        break;
      case 'connected':
        if (quality) {
          const qualityText = {
            good: 'Conexión buena',
            medium: 'Conexión media',
            poor: 'Conexión débil',
          };
          setDisplayText(qualityText[quality]);
          const qualityColor = {
            good: 'text-green-500',
            medium: 'text-yellow-500',
            poor: 'text-red-500',
          };
          setColorClass(qualityColor[quality]);
        } else {
          setDisplayText('Conectado');
          setColorClass('text-green-500');
        }
        break;
      case 'disconnected':
        setDisplayText('Desconectado');
        setColorClass('text-gray-500');
        break;
      case 'failed':
        setDisplayText('Error de conexión');
        setColorClass('text-red-500');
        break;
      default:
        setDisplayText('');
        setColorClass('');
    }
  }, [state, quality]);

  if (!displayText) {
    return <></>;
  }

  const getIcon = () => {
    if (state === 'connected') {
      if (quality === 'good') {
        return (
          <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      } else if (quality === 'medium') {
        return (
          <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      } else {
        return (
          <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      }
    } else if (state === 'connecting') {
      return (
        <svg className="w-3 h-3 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    } else if (state === 'failed') {
      return (
        <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    }
    return null;
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {getIcon() || (
      <div
          className={`w-2.5 h-2.5 rounded-full ${
          state === 'connected'
            ? quality === 'good'
              ? 'bg-green-500'
              : quality === 'medium'
                ? 'bg-yellow-500'
                : 'bg-red-500'
            : state === 'connecting'
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-gray-500'
        }`}
      />
      )}
      <span className={`text-xs font-semibold ${colorClass} transition-colors duration-200`}>{displayText}</span>
    </div>
  );
}

