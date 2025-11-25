import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore, useAuthHydrated } from '@application/stores/auth-store';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ThemeToggle } from '../components/ThemeToggle';

export function RegisterPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldNavigate, setShouldNavigate] = useState(false);
  const register = useAuthStore((state) => state.register);
  const hasHydrated = useAuthHydrated();
  const navigate = useNavigate();

  // Navegar después de que el estado se haya hidratado y WebSocket esté listo
  useEffect(() => {
    if (shouldNavigate && hasHydrated) {
      // Small delay to ensure auth state is fully persisted
      const timer = setTimeout(() => {
      navigate('/videochat');
      setShouldNavigate(false);
      }, 100);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [shouldNavigate, hasHydrated, navigate]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await register(email, password, name, username);
      // Esperar a que el estado se hidrate antes de navegar
      setShouldNavigate(true);
    } catch (err: any) {
      // Manejar errores específicos
      if (err?.response?.data?.error?.message) {
        const errorMessage = err.response.data.error.message;
        if (errorMessage.includes('Username already taken') || errorMessage.includes('username')) {
          setError('Este nombre de usuario ya está en uso. Por favor elige otro.');
        } else if (errorMessage.includes('Email already registered') || errorMessage.includes('email')) {
          setError('Este email ya está registrado. Por favor inicia sesión.');
        } else {
          setError(errorMessage);
        }
      } else {
      setError('Error al registrarse. Intenta nuevamente.');
      }
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
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Registrarse</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Crea tu cuenta</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-lg">
              {error}
            </div>
          )}
          <Input
            id="name"
            type="text"
            label="Nombre completo"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre completo"
            autoComplete="name"
          />
          <Input
            id="username"
            type="text"
            label="Nombre de usuario"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="tu_username (solo letras, números y guiones bajos)"
            autoComplete="username"
            pattern="[a-zA-Z0-9_]{3,30}"
            title="El nombre de usuario debe tener entre 3 y 30 caracteres y solo puede contener letras, números y guiones bajos"
          />
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
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
          />
          <Button type="submit" disabled={loading} isLoading={loading} className="w-full">
            Registrarse
          </Button>
          <p className="text-center text-sm text-gray-400">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

