/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { createUser } from '@domain/entities/user';

describe('User Entity', () => {
  it('should create a user with required fields', () => {
    const user = createUser({
      username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
    });

    expect(user.username).toBe('testuser');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    expect(user.emailVerified).toBe(false);
  });

  it('should create user with optional fields', () => {
    const user = createUser({
      username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
      bio: 'Test bio',
    });

    expect(user.avatar).toBe('https://example.com/avatar.jpg');
    expect(user.bio).toBe('Test bio');
  });
});
