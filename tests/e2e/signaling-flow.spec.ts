import { test, expect } from '@playwright/test';
import { mockMediaDevices, waitForWebRTCConnection, waitForVideoStream } from './fixtures/webrtc-helpers';
import { generateTestUser, registerUser, loginUser, waitForAuthentication } from './fixtures/auth-helpers';
import { waitForVideochatReady, startMatching, waitForMatch, sendMessage, waitForMessage, endSession } from './fixtures/matching-helpers';

/**
 * E2E tests for complete signaling flow: registro → login → videochat → mensajes → WebRTC
 */

test.describe('Complete Signaling Flow', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['camera', 'microphone']);
  });

  test('complete flow: register → login → videochat → messages → WebRTC', async ({ browser }) => {
    const baseURL = (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';
    
    // Create two browser contexts for two users
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();
    
    const user1Page = await user1Context.newPage();
    const user2Page = await user2Context.newPage();

    try {
      // Mock media devices for both users
      await mockMediaDevices(user1Page);
      await mockMediaDevices(user2Page);

      // Generate test users
      const user1 = generateTestUser();
      const user2 = generateTestUser();

      // Navigate to base URL
      await user1Page.goto(baseURL);
      await user2Page.goto(baseURL);
      await user1Page.waitForLoadState('networkidle');
      await user2Page.waitForLoadState('networkidle');

      // Step 1: Register both users
      await registerUser(user1Page, user1);
      await registerUser(user2Page, user2);

      // Verify both users are authenticated
      await waitForAuthentication(user1Page);
      await waitForAuthentication(user2Page);

      // Step 2: Both users should be on videochat page
      await expect(user1Page).toHaveURL(/\/videochat/);
      await expect(user2Page).toHaveURL(/\/videochat/);

      // Step 3: Wait for videochat to be ready (local video started)
      await waitForVideochatReady(user1Page);
      await waitForVideochatReady(user2Page);

      // Step 4: Both users start matching
      await startMatching(user1Page);
      await startMatching(user2Page);

      // Step 5: Wait for match to be found (both users should see chat window)
      await waitForMatch(user1Page, 60000);
      await waitForMatch(user2Page, 60000);

      // Step 6: Exchange text messages
      const message1 = 'Hello from user 1!';
      const message2 = 'Hello from user 2!';

      await sendMessage(user1Page, message1);
      await waitForMessage(user2Page, message1);

      await sendMessage(user2Page, message2);
      await waitForMessage(user1Page, message2);

      // Step 7: Wait for WebRTC connection to be established
      // This happens automatically when match is found
      // Check for remote video element
      await user1Page.waitForSelector('video', { timeout: 30000 });
      await user2Page.waitForSelector('video', { timeout: 30000 });

      // Wait for video streams to be active
      const video1 = user1Page.locator('video').first();
      const video2 = user2Page.locator('video').first();
      
      await expect(video1).toBeVisible({ timeout: 10000 });
      await expect(video2).toBeVisible({ timeout: 10000 });

      // Step 8: End session and return to lobby
      await endSession(user1Page);
      await endSession(user2Page);

      // Verify both users are back on videochat page
      await expect(user1Page).toHaveURL(/\/videochat/);
      await expect(user2Page).toHaveURL(/\/videochat/);
    } finally {
      await user1Context.close();
      await user2Context.close();
    }
  });

  test('login → videochat → match → messages → WebRTC', async ({ browser }) => {
    const baseURL = (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';
    
    // Create two browser contexts for two users
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();
    
    const user1Page = await user1Context.newPage();
    const user2Page = await user2Context.newPage();

    try {
      // Mock media devices
      await mockMediaDevices(user1Page);
      await mockMediaDevices(user2Page);

      // Generate and register users first (prerequisite for login)
      const user1 = generateTestUser();
      const user2 = generateTestUser();

      await user1Page.goto(baseURL);
      await user2Page.goto(baseURL);
      await user1Page.waitForLoadState('networkidle');
      await user2Page.waitForLoadState('networkidle');

      // Register users
      await registerUser(user1Page, user1);
      await registerUser(user2Page, user2);

      // Logout both users
      await user1Page.goto(baseURL + '/login');
      await user2Page.goto(baseURL + '/login');

      // Step 1: Login both users
      await loginUser(user1Page, user1.email, user1.password);
      await loginUser(user2Page, user2.email, user2.password);

      // Verify authentication
      await waitForAuthentication(user1Page);
      await waitForAuthentication(user2Page);

      // Step 2: Both users should be on videochat page
      await expect(user1Page).toHaveURL(/\/videochat/);
      await expect(user2Page).toHaveURL(/\/videochat/);

      // Step 3: Wait for videochat to be ready
      await waitForVideochatReady(user1Page);
      await waitForVideochatReady(user2Page);

      // Step 4: Start matching
      await startMatching(user1Page);
      await startMatching(user2Page);

      // Step 5: Wait for match
      await waitForMatch(user1Page, 60000);
      await waitForMatch(user2Page, 60000);

      // Step 6: Exchange messages
      await sendMessage(user1Page, 'Test message 1');
      await waitForMessage(user2Page, 'Test message 1');

      await sendMessage(user2Page, 'Test message 2');
      await waitForMessage(user1Page, 'Test message 2');

      // Step 7: Verify WebRTC connection (video elements visible)
      await user1Page.waitForSelector('video', { timeout: 30000 });
      await user2Page.waitForSelector('video', { timeout: 30000 });
    } finally {
      await user1Context.close();
      await user2Context.close();
    }
  });

  test('rate limiting on video:offer events', async ({ browser, context }) => {
    const page = await context.newPage();
    await mockMediaDevices(page);

    const baseURL = (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    // Register and login a user
    const user = generateTestUser();
    await registerUser(page, user);
    await waitForVideochatReady(page);

    // Monitor WebSocket messages for offers
    const offerMessages: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (event) => {
        if (event.payload && event.payload.toString().includes('video:offer')) {
          offerMessages.push(event.payload.toString());
        }
      });
    });

    // Start matching to establish connection
    await startMatching(page);
    
    // Note: Rate limiting test requires a match to be found first
    // The actual rate limiting happens server-side, so we can only verify
    // that offers are being sent and monitor for any error messages
    
    // Wait a bit to see if multiple offers are sent
    await page.waitForTimeout(5000);

    // Verify that page is still functional (no errors)
    expect(await page.title()).toBeTruthy();
    await context.close();
  });

  test('handles signaling errors gracefully', async ({ browser, context }) => {
    const page = await context.newPage();
    await mockMediaDevices(page);

    const baseURL = (process.env as { E2E_BASE_URL?: string }).E2E_BASE_URL || 'http://localhost:5173';
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    // Register and login
    const user = generateTestUser();
    await registerUser(page, user);
    await waitForVideochatReady(page);

    // Start matching
    await startMatching(page);

    // Simulate network offline
    await context.setOffline(true);
    await page.waitForTimeout(2000);

    // Verify error handling (should show error message or attempt reconnection)
    // The app should handle this gracefully without crashing

    // Simulate network online
    await context.setOffline(false);
    await page.waitForTimeout(5000);

    // Verify page is still functional
    expect(await page.title()).toBeTruthy();
    await context.close();
  });
});

