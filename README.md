# Chatroulette Frontend

[![Frontend CI](https://github.com/Codeqlick/chatroulette-frontend/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/Codeqlick/chatroulette-frontend/actions/workflows/ci.yml)
[![Frontend Deploy](https://github.com/Codeqlick/chatroulette-frontend/actions/workflows/deploy.yml/badge.svg)](https://github.com/Codeqlick/chatroulette-frontend/actions/workflows/deploy.yml)

Frontend React para plataforma Chatroulette construido con TypeScript, React 18, Vite y Tailwind CSS siguiendo Clean Architecture.

## Arquitectura

El frontend sigue **Clean Architecture** con las siguientes capas:

- **Domain**: Modelos y entidades del dominio
- **Application**: Casos de uso, stores (Zustand) y lógica de aplicación
- **Infrastructure**: API clients, WebSocket, storage
- **Presentation**: Componentes React, páginas y UI

## Tecnologías

- **Framework**: React 18+ con TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **WebSocket**: Socket.io-client
- **HTTP Client**: Axios
- **Testing**: Vitest + React Testing Library
- **E2E**: Playwright

## Estructura

```
frontend/
├── src/
│   ├── domain/              # Capa de Dominio
│   │   └── entities/        # Entidades del dominio
│   ├── application/          # Capa de Aplicación
│   │   └── stores/          # Zustand stores
│   ├── infrastructure/       # Capa de Infraestructura
│   │   ├── api/             # API clients
│   │   └── websocket/       # WebSocket service
│   └── presentation/        # Capa de Presentación
│       ├── components/       # Componentes React
│       ├── pages/            # Páginas/rutas
│       └── styles/           # Estilos globales
├── config/                  # Configuración
│   ├── env.schema.ts        # Validación de variables de entorno
│   └── constants.ts         # Constantes
└── tests/                   # Tests

```

## Configuración

### Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

```bash
cp .env.example .env
```

Variables:
- `VITE_API_URL`: URL de la API backend
  - Desarrollo: `http://localhost:3000/api/v1`
  - Producción: `https://api.codeqlick.com/api/v1`
- `VITE_WS_URL`: URL del servidor WebSocket
  - Desarrollo: `http://localhost:3000`
  - Producción: `wss://api.codeqlick.com`

## Desarrollo

```bash
# Instalar dependencias
npm install

# Modo desarrollo
npm run dev

# Build para producción
npm run build

# Preview de build
npm run preview
```

## Testing

```bash
# Ejecutar tests
npm test

# Tests con UI
npm run test:ui

# Tests con cobertura
npm run test:coverage
```

## Linting y Formato

```bash
# Lint
npm run lint

# Lint con auto-fix
npm run lint:fix

# Formatear código
npm run format

# Verificar formato
npm run format:check

# Type check
npm run type-check
```

## Páginas

- `/login` - Inicio de sesión
- `/register` - Registro de usuario
- `/` - Videochat (inicia búsqueda automáticamente)
- `/chat/:sessionId` - Sala de chat

## Estándares

Este proyecto sigue estrictamente los estándares definidos en `../Engineering-Standards.md`.

**Principales reglas:**
- ✅ TypeScript strict mode obligatorio
- ✅ Clean Architecture con separación de capas
- ✅ Tests con cobertura mínima 80%
- ✅ Mobile-first design
- ✅ Accesibilidad WCAG 2.1 AA

## Flujo de trabajo Git

- `main`: rama estable y desplegable.
- `develop`: rama de integración para validar cambios antes de `main`.
- `feature/<descripcion-corta>`: ramas desde `develop` para nuevas features o mejoras.
- `hotfix/<descripcion-corta>`: ramas desde `main` para correcciones críticas, se retro-propagan a `develop`.

**Buenas prácticas**
- Commits pequeños con mensajes imperativos.
- PRs obligatorias con revisión cruzada.
- Mantener `main` protegido con CI y revisiones obligatorias.

## CI/CD

- **`Frontend CI`** (`.github/workflows/ci.yml`): corre en PRs y en `main/develop`. Ejecuta `npm ci`, lint, type-check, tests (Vitest) con cobertura y build de Vite.
- **`Frontend Deploy`** (`.github/workflows/deploy.yml`): workflow manual (`workflow_dispatch`) que sincroniza el repo en la VPS y ejecuta `docker compose -f docker-compose.production.yml up -d frontend`.

### Secretos requeridos

| Secreto | Descripción |
| --- | --- |
| `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_PORT` | Acceso SSH a la VPS |
| `DEPLOY_PATH` | Ruta donde vive el proyecto (ej. `/srv/codeqlick/chatroulette`) |
| `COMPOSE_FILE` | (Opcional) ruta al docker-compose |

Habilita branch protection en `main` y `develop` para exigir el check `Frontend CI` y revisión de PRs.

---

**Última actualización:** 2024

