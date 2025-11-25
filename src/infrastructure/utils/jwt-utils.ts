/**
 * JWT Utilities
 *
 * Utilidades para decodificar y validar tokens JWT sin verificar la firma.
 * Útil para leer información como la fecha de expiración.
 */

import { logger } from '@infrastructure/logging/frontend-logger';

export interface JWTPayload {
  userId: string;
  email: string;
  exp: number; // Expiration time (timestamp in seconds)
  iat: number; // Issued at (timestamp in seconds)
  [key: string]: unknown; // Allow other properties
}

/**
 * Decodifica un token JWT sin verificar la firma
 * Útil para leer el payload y la fecha de expiración
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    // Split token into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode base64 payload (second part)
    const payload = parts[1];
    if (!payload) {
      return null;
    }
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(decoded) as JWTPayload;

    return parsed;
  } catch (error) {
    logger.error('Error decoding JWT', { error });
    return null;
  }
}

/**
 * Obtiene el timestamp de expiración del token en milisegundos
 */
export function getTokenExpirationTime(token: string): number | null {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return null;
  }

  // exp is in seconds, convert to milliseconds
  return payload.exp * 1000;
}

/**
 * Verifica si un token está próximo a expirar
 * @param token - El token JWT a verificar
 * @param bufferMinutes - Minutos antes de la expiración para considerar "próximo a expirar" (default: 5)
 * @returns true si el token expira en menos de bufferMinutes
 */
export function isTokenExpiringSoon(token: string, bufferMinutes = 5): boolean {
  const expirationTime = getTokenExpirationTime(token);
  if (!expirationTime) {
    // Si no podemos obtener la expiración, asumimos que está próximo a expirar por seguridad
    return true;
  }

  const now = Date.now();
  const bufferMs = bufferMinutes * 60 * 1000;
  const expirationThreshold = expirationTime - bufferMs;

  return now >= expirationThreshold;
}

/**
 * Verifica si un token está expirado
 */
export function isTokenExpired(token: string): boolean {
  const expirationTime = getTokenExpirationTime(token);
  if (!expirationTime) {
    return true; // Si no podemos obtener la expiración, asumimos expirado
  }

  const now = Date.now();
  return now >= expirationTime;
}

/**
 * Obtiene los minutos restantes hasta que expire el token
 */
export function getMinutesUntilExpiration(token: string): number | null {
  const expirationTime = getTokenExpirationTime(token);
  if (!expirationTime) {
    return null;
  }

  const now = Date.now();
  const msUntilExpiration = expirationTime - now;
  const minutesUntilExpiration = Math.floor(msUntilExpiration / (60 * 1000));

  return minutesUntilExpiration;
}
