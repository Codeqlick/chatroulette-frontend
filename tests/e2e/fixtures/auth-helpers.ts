import { Page } from '@playwright/test';

/**
 * Helper functions for authentication E2E tests.
 */

export interface TestUser {
  email: string;
  password: string;
  name: string;
  username: string;
}

/**
 * Generates a unique test user with random email and username.
 */
export function generateTestUser(): TestUser {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return {
    email: `test-${timestamp}-${random}@example.com`,
    password: 'TestPassword123!',
    name: `Test User ${timestamp}`,
    username: `testuser${timestamp}${random}`,
  };
}

/**
 * Registers a new user via the UI.
 */
export async function registerUser(page: Page, user: TestUser): Promise<void> {
  // Navigate to register page
  await page.goto('/register');
  await page.waitForLoadState('networkidle');

  // Fill registration form
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.fill('input[name="name"]', user.name);
  await page.fill('input[name="username"]', user.username);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to videochat page (registration redirects there)
  await page.waitForURL('/videochat', { timeout: 10000 });
}

/**
 * Logs in a user via the UI.
 */
export async function loginUser(page: Page, email: string, password: string): Promise<void> {
  // Navigate to login page
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Fill login form
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to videochat page (login redirects there)
  await page.waitForURL('/videochat', { timeout: 10000 });
}

/**
 * Waits for the user to be authenticated (checks for videochat page or auth state).
 */
export async function waitForAuthentication(page: Page, timeout = 10000): Promise<void> {
  // Wait for videochat page or check localStorage for tokens
  await page.waitForFunction(
    () => {
      const hasToken = localStorage.getItem('accessToken') !== null;
      const isVideochatPage = window.location.pathname === '/videochat';
      return hasToken || isVideochatPage;
    },
    { timeout }
  );
}

/**
 * Checks if user is authenticated by checking localStorage.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    return localStorage.getItem('accessToken') !== null;
  });
}

/**
 * Logs out the current user.
 */
export async function logoutUser(page: Page): Promise<void> {
  // Find and click logout button (usually in header/menu)
  // This depends on the UI structure
  const logoutButton = page
    .locator('button:has-text("Cerrar Sesión"), button:has-text("Logout")')
    .first();
  if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutButton.click();
    // Wait for redirect to landing/login page
    await page.waitForURL(/\/(login|landing)/, { timeout: 5000 });
  }
}
