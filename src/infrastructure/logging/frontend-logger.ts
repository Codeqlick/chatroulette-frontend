/**
 * Frontend Logger Service
 *
 * Provides structured logging for the frontend application.
 * Replaces console.log/error/warn with a proper logging service.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class FrontendLogger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      level,
      message,
      timestamp,
      ...context,
    };

    // In development, use console with colors
    if (this.isDevelopment) {
      const colorMap: Record<LogLevel, string> = {
        debug: '\x1b[36m', // Cyan
        info: '\x1b[32m', // Green
        warn: '\x1b[33m', // Yellow
        error: '\x1b[31m', // Red
      };
      const reset = '\x1b[0m';
      const color = colorMap[level] || reset;

      console[level === 'debug' ? 'log' : level](
        `${color}[${level.toUpperCase()}]${reset}`,
        logEntry
      );
    } else {
      // In production, send to logging service (e.g., Sentry)
      // For now, only log errors and warnings in production
      if (level === 'error' || level === 'warn') {
        console[level](JSON.stringify(logEntry));
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }
}

export const logger = new FrontendLogger();
