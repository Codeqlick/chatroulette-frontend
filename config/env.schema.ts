import { z } from 'zod';

// Detectar si estamos en producción (modo build de producción)
const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';

// Schema base con validación según el entorno
const envSchema = z.object({
  VITE_API_URL: z
    .string()
    .url()
    .refine(
      (url) => {
        // En producción, debe ser HTTPS
        if (isProduction) {
          return url.startsWith('https://');
        }
        return true; // En desarrollo, permite HTTP
      },
      {
        message: isProduction
          ? 'VITE_API_URL debe ser HTTPS en producción (ej: https://api.codeqlick.com/api/v1)'
          : 'VITE_API_URL debe ser una URL válida',
      }
    )
    .default('http://localhost:3000/api/v1'),
  VITE_WS_URL: z
    .string()
    .url()
    .refine(
      (url) => {
        // En producción, debe ser WSS (WebSocket Secure)
        if (isProduction) {
          return url.startsWith('wss://');
        }
        return true; // En desarrollo, permite WS
      },
      {
        message: isProduction
          ? 'VITE_WS_URL debe ser WSS en producción (ej: wss://api.codeqlick.com)'
          : 'VITE_WS_URL debe ser una URL válida',
      }
    )
    .default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function validateEnv(): Env {
  if (!env) {
    const rawEnv = {
      VITE_API_URL: import.meta.env.VITE_API_URL,
      VITE_WS_URL: import.meta.env.VITE_WS_URL,
    };

    // En producción, advertir si no están configuradas
    if (isProduction && (!rawEnv.VITE_API_URL || !rawEnv.VITE_WS_URL)) {
      console.warn(
        '⚠️  ADVERTENCIA: Variables de entorno de producción no configuradas.\n' +
          'En producción, debes configurar:\n' +
          '  - VITE_API_URL=https://api.codeqlick.com/api/v1\n' +
          '  - VITE_WS_URL=wss://api.codeqlick.com\n' +
          'Estas variables deben configurarse ANTES del build (en .env.production o como variables de entorno).'
      );
    }

    env = envSchema.parse(rawEnv);
  }
  return env;
}

export function getEnv(): Env {
  if (!env) {
    return validateEnv();
  }
  return env;
}

