import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '@infrastructure/api/auth-service';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

export function VerifyEmailPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Token de verificación no encontrado');
      return;
    }

    const verifyEmail = async (): Promise<void> => {
      try {
        setLoading(true);
        const result = await authService.verifyEmail(token);
        setStatus('success');
        setMessage(result.message);
      } catch (error) {
        setStatus('error');
        if (error instanceof Error) {
          setMessage('Error al verificar el email. El token puede haber expirado.');
        } else {
          setMessage('Error desconocido al verificar el email');
        }
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [searchParams]);

  const handleResendEmail = async (): Promise<void> => {
    try {
      setLoading(true);
      await authService.sendVerificationEmail();
      setMessage('Email de verificación enviado. Revisa tu bandeja de entrada.');
    } catch (error) {
      setMessage('Error al enviar el email de verificación. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 transition-colors relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg transition-colors animate-fade-in">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Verificación de Email</h2>
        </div>

        {status === 'verifying' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Verificando tu email...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-4">
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <p className="text-white text-lg">{message}</p>
            <Button
              onClick={() => navigate('/videochat')}
              className="w-full"
            >
              Ir al inicio
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-4">
            <div className="text-red-500 text-5xl mb-4">✗</div>
            <p className="text-red-500">{message}</p>
            <div className="space-y-2">
              <Button
                onClick={handleResendEmail}
                disabled={loading}
                isLoading={loading}
                variant="secondary"
                className="w-full"
              >
                Reenviar email de verificación
              </Button>
              <Link
                to="/login"
                className="block text-center text-primary-400 hover:text-primary-300 font-medium"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

