import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore, useAuthHydrated } from '@application/stores/auth-store';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ThemeToggle } from '../components/ThemeToggle';

export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldNavigate, setShouldNavigate] = useState(false);
  const login = useAuthStore((state) => state.login);
  const hasHydrated = useAuthHydrated();
  const navigate = useNavigate();

  // Navegar después de que el estado se haya hidratado
  useEffect(() => {
    if (shouldNavigate && hasHydrated) {
      navigate('/videochat');
      setShouldNavigate(false);
    }
  }, [shouldNavigate, hasHydrated, navigate]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      // Esperar a que el estado se hidrate antes de navegar
      setShouldNavigate(true);
    } catch (err) {
      setError('Error al iniciar sesión. Verifica tus credenciales.');
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
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Iniciar Sesión</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Accede a tu cuenta</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-lg">
              {error}
            </div>
          )}
          <Input
            id="email"
            type="email"
            label="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
          />
          <Input
            id="password"
            type="password"
            label="Contraseña"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <Button type="submit" disabled={loading} isLoading={loading} className="w-full">
            Iniciar Sesión
          </Button>
          <p className="text-center text-sm text-gray-400">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium">
              Regístrate
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

