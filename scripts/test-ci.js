#!/usr/bin/env node

/* eslint-env node */
/**
 * Script wrapper para ejecutar tests en CI
 * Filtra argumentos desconocidos que Vitest no reconoce (como --runInBand de Jest)
 */
import { spawn } from 'child_process';

// Argumentos válidos de Vitest
const validArgs = [
  'run',
  '--run',
  '--watch',
  '--ui',
  '--coverage',
  '--reporter',
  '--threads',
  '--max-threads',
  '--min-threads',
  '--test-timeout',
  '--hook-timeout',
  '--bail',
  '--changed',
  '--related',
  '--no-coverage',
  '--reporter=verbose',
  '--reporter=basic',
  '--reporter=dot',
  '--reporter=json',
  '--reporter=html',
];

// Filtrar argumentos desconocidos
const args = process.argv.slice(2).filter((arg) => {
  // Permitir argumentos válidos
  if (validArgs.some((valid) => arg.startsWith(valid))) {
    return true;
  }
  // Ignorar --runInBand y otros flags de Jest
  if (arg === '--runInBand' || arg.startsWith('--runInBand')) {
    return false;
  }
  // Permitir otros argumentos que podrían ser válidos
  return true;
});

// Ejecutar vitest con argumentos filtrados
const vitest = spawn('vitest', ['run', ...args], {
  stdio: 'inherit',
  shell: true,
});

vitest.on('close', (code) => {
  process.exit(code ?? 0);
});

vitest.on('error', (error) => {
  console.error('Error ejecutando vitest:', error);
  process.exit(1);
});

