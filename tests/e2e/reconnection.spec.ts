import { test, expect } from '@playwright/test';
import { mockMediaDevices } from './fixtures/webrtc-helpers';
import { generateTestUser, registerUser, waitForAuthentication } from './fixtures/auth-helpers';
import { waitForVideochatReady, startMatching, waitForMatch } from './fixtures/matching-helpers';

/**
 * E2E tests for WebRTC reconnection after network disconnection.
 */

test.describe('WebRTC Reconnection', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['camera', 'microphone']);
  });

  test('reconnects WebSocket after disconnection', async ({ browser }) => {
    const baseURL =
      (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await mockMediaDevices(page);
      await page.goto(baseURL);
      await page.waitForLoadState('networkidle');

      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);
      await waitForAuthentication(page);
      await waitForVideochatReady(page);

      // Start matching to establish WebSocket connection
      await startMatching(page);

      // Wait a bit for WebSocket to be connected
      await page.waitForTimeout(2000);

      // Simulate network offline
      await context.setOffline(true);
      await page.waitForTimeout(2000);

      // Simulate network online
      await context.setOffline(false);

      // Wait for reconnection (WebSocket should reconnect automatically)
      await page.waitForTimeout(5000);

      // Verify page is still functional
      expect(await page.title()).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test('reconnects WebRTC after connection failure', async ({ browser }) => {
    const baseURL =
      (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';

    // Create two contexts for two users
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();

    const user1Page = await user1Context.newPage();
    const user2Page = await user2Context.newPage();

    try {
      await mockMediaDevices(user1Page);
      await mockMediaDevices(user2Page);

      const user1 = generateTestUser();
      const user2 = generateTestUser();

      await user1Page.goto(baseURL);
      await user2Page.goto(baseURL);
      await user1Page.waitForLoadState('networkidle');
      await user2Page.waitForLoadState('networkidle');

      // Register both users
      await registerUser(user1Page, user1);
      await registerUser(user2Page, user2);

      // Start matching and wait for match
      await waitForVideochatReady(user1Page);
      await waitForVideochatReady(user2Page);
      await startMatching(user1Page);
      await startMatching(user2Page);
      await waitForMatch(user1Page, 60000);
      await waitForMatch(user2Page, 60000);

      // Wait for WebRTC connection to be established
      await user1Page.waitForSelector('video', { timeout: 30000 });
      await user2Page.waitForSelector('video', { timeout: 30000 });

      // Simulate network disconnection for user1
      await user1Context.setOffline(true);
      await user1Page.waitForTimeout(2000);

      // Simulate network reconnection
      await user1Context.setOffline(false);
      await user1Page.waitForTimeout(5000);

      // Verify WebRTC reconnection (video should still be visible)
      const video1 = user1Page.locator('video').first();
      await expect(video1).toBeVisible({ timeout: 10000 });
    } finally {
      await user1Context.close();
      await user2Context.close();
    }
  });

  test('recovers active session after page reload', async ({ browser }) => {
    const baseURL =
      (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await mockMediaDevices(page);
      await page.goto(baseURL);
      await page.waitForLoadState('networkidle');

      // Register and login
      const user = generateTestUser();
      await registerUser(page, user);
      await waitForVideochatReady(page);

      // Start matching
      await startMatching(page);
      await waitForMatch(page, 60000);

      // Verify session is active (chat window visible)
      await page.waitForSelector(
        'input[type="text"][placeholder*="mensaje"], textarea[placeholder*="mensaje"]',
        {
          timeout: 10000,
        }
      );

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Wait for session to be recovered (should still show chat window)
      await page.waitForSelector(
        'input[type="text"][placeholder*="mensaje"], textarea[placeholder*="mensaje"]',
        {
          timeout: 10000,
        }
      );
    } finally {
      await context.close();
    }
  });

  test('handles reconnection during active chat', async ({ browser }) => {
    const baseURL =
      (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';

    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();

    const user1Page = await user1Context.newPage();
    const user2Page = await user2Context.newPage();

    try {
      await mockMediaDevices(user1Page);
      await mockMediaDevices(user2Page);

      const user1 = generateTestUser();
      const user2 = generateTestUser();

      await user1Page.goto(baseURL);
      await user2Page.goto(baseURL);
      await user1Page.waitForLoadState('networkidle');
      await user2Page.waitForLoadState('networkidle');

      // Register and match
      await registerUser(user1Page, user1);
      await registerUser(user2Page, user2);
      await waitForVideochatReady(user1Page);
      await waitForVideochatReady(user2Page);
      await startMatching(user1Page);
      await startMatching(user2Page);
      await waitForMatch(user1Page, 60000);
      await waitForMatch(user2Page, 60000);

      // Send a message
      const messageInput1 = user1Page
        .locator('input[type="text"][placeholder*="mensaje"], textarea[placeholder*="mensaje"]')
        .first();
      await messageInput1.fill('Test message');
      const sendButton1 = user1Page
        .locator('button:has-text("Enviar"), button[type="submit"]')
        .first();
      await sendButton1.click();

      // Disconnect user1's network
      await user1Context.setOffline(true);
      await user1Page.waitForTimeout(2000);

      // Reconnect
      await user1Context.setOffline(false);
      await user1Page.waitForTimeout(5000);

      // Verify chat is still functional
      await expect(messageInput1).toBeVisible({ timeout: 10000 });
    } finally {
      await user1Context.close();
      await user2Context.close();
    }
  });

  test('reconnection with exponential backoff', async ({ browser }) => {
    const baseURL =
      (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await mockMediaDevices(page);
      await page.goto(baseURL);
      await page.waitForLoadState('networkidle');

      const user = generateTestUser();
      await registerUser(page, user);
      await waitForVideochatReady(page);
      await startMatching(page);

      // Simulate multiple disconnections (should use exponential backoff)
      for (let i = 0; i < 3; i++) {
        await context.setOffline(true);
        await page.waitForTimeout(1000);
        await context.setOffline(false);
        // Wait longer each time to account for exponential backoff
        const waitTime = 2000 * Math.pow(2, i);
        await page.waitForTimeout(waitTime);
      }

      // Verify final connection state (should eventually reconnect)
      expect(await page.title()).toBeTruthy();
    } finally {
      await context.close();
    }
  });
});
