import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

export function LandingPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl md:text-3xl font-bold">ChatRoulette</h1>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link to="/login">
                <Button variant="secondary" size="sm">
                  Iniciar Sesión
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">
                  Registrarse
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="text-center animate-fade-in-up">
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            Conecta con personas de todo el mundo
          </h2>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
            Video chat aleatorio con matching inteligente. Encuentra nuevas amistades y
            conversaciones interesantes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register">
              <Button variant="primary" size="lg">
                Comenzar Ahora
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="lg">
                Ya tengo cuenta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white dark:bg-gray-800 py-20 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Características Principales
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-900 transition-colors animate-scale-in-delayed">
              <div className="text-4xl mb-4">🎥</div>
              <h4 className="text-xl font-bold mb-2">Video Chat en Tiempo Real</h4>
              <p className="text-gray-600 dark:text-gray-400">
                Conecta instantáneamente con video de alta calidad usando tecnología WebRTC.
              </p>
            </div>
            <div
              className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-900 transition-colors animate-scale-in-delayed"
              style={{ animationDelay: '0.1s' }}
            >
              <div className="text-4xl mb-4">🎯</div>
              <h4 className="text-xl font-bold mb-2">Matching Inteligente</h4>
              <p className="text-gray-600 dark:text-gray-400">
                Algoritmo avanzado que conecta usuarios con intereses similares.
              </p>
            </div>
            <div
              className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-900 transition-colors animate-scale-in-delayed"
              style={{ animationDelay: '0.2s' }}
            >
              <div className="text-4xl mb-4">🔒</div>
              <h4 className="text-xl font-bold mb-2">Seguro y Privado</h4>
              <p className="text-gray-600 dark:text-gray-400">
                Tu privacidad es nuestra prioridad. Conexiones seguras y moderación activa.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl md:text-4xl font-bold text-center mb-12">¿Cómo Funciona?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4">
                1
              </div>
              <h4 className="text-xl font-bold mb-2">Crea tu cuenta</h4>
              <p className="text-gray-600 dark:text-gray-400">
                Regístrate de forma rápida y sencilla. Solo necesitas un email y contraseña.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4">
                2
              </div>
              <h4 className="text-xl font-bold mb-2">Busca un chat</h4>
              <p className="text-gray-600 dark:text-gray-400">
                Presiona el botón y nuestro sistema encontrará alguien para chatear contigo.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4">
                3
              </div>
              <h4 className="text-xl font-bold mb-2">¡Conecta y disfruta!</h4>
              <p className="text-gray-600 dark:text-gray-400">
                Comienza a conversar y conoce personas nuevas de todo el mundo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">¿Listo para comenzar?</h3>
          <p className="text-xl text-primary-100 mb-8">
            Únete a nuestra comunidad y descubre nuevas conexiones hoy mismo.
          </p>
          <Link to="/register">
            <Button variant="secondary" size="lg">
              Crear Cuenta Gratis
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-8 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              © 2024 ChatRoulette. Todos los derechos reservados.
            </p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <Link
                to="/login"
                className="text-gray-600 dark:text-gray-400 hover:text-primary-500 text-sm transition-colors"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/register"
                className="text-gray-600 dark:text-gray-400 hover:text-primary-500 text-sm transition-colors"
              >
                Registrarse
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
