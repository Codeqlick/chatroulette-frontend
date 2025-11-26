import { Page } from '@playwright/test';

/**
 * Helper functions for matching E2E tests.
 */

/**
 * Waits for the videochat page to be ready (local video started).
 */
export async function waitForVideochatReady(page: Page, timeout = 30000): Promise<void> {
  // Wait for video element to be present and have stream
  await page.waitForSelector('video', { timeout });

  // Wait for video to have srcObject
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      return video !== null && video.srcObject !== null;
    },
    { timeout }
  );
}

/**
 * Starts matching by clicking the "Conectar" button.
 */
export async function startMatching(page: Page): Promise<void> {
  // Find and click the connect button
  const connectButton = page
    .locator('button:has-text("Conectar"), button:has-text("▶️ Conectar")')
    .first();
  await connectButton.waitFor({ state: 'visible', timeout: 10000 });
  await connectButton.click();
}

/**
 * Waits for a match to be found (checks for chat window or session).
 */
export async function waitForMatch(page: Page, timeout = 60000): Promise<void> {
  // Wait for chat window to appear (indicates match found)
  // Chat window typically has message input or partner info
  await page.waitForSelector(
    'input[type="text"][placeholder*="mensaje"], textarea[placeholder*="mensaje"]',
    {
      timeout,
    }
  );
}

/**
 * Checks if user is currently searching for a match.
 */
export async function isSearching(page: Page): Promise<boolean> {
  // Check for searching overlay or indicator
  const searchingIndicator = page.locator('text=Buscando, text=Searching').first();
  return await searchingIndicator.isVisible({ timeout: 1000 }).catch(() => false);
}

/**
 * Cancels the current search.
 */
export async function cancelSearch(page: Page): Promise<void> {
  const cancelButton = page
    .locator('button:has-text("Cancelar"), button:has-text("Cancel")')
    .first();
  if (await cancelButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelButton.click();
  }
}

/**
 * Sends a text message in the chat.
 */
export async function sendMessage(page: Page, message: string): Promise<void> {
  // Find message input
  const messageInput = page
    .locator('input[type="text"][placeholder*="mensaje"], textarea[placeholder*="mensaje"]')
    .first();
  await messageInput.fill(message);

  // Find and click send button
  const sendButton = page.locator('button:has-text("Enviar"), button[type="submit"]').first();
  await sendButton.click();
}

/**
 * Waits for a message to appear in the chat.
 */
export async function waitForMessage(
  page: Page,
  messageText: string,
  timeout = 10000
): Promise<void> {
  await page.waitForSelector(`text=${messageText}`, { timeout });
}

/**
 * Ends the current session.
 */
export async function endSession(page: Page): Promise<void> {
  // Find end session button (usually "Siguiente" or "Terminar")
  const endButton = page
    .locator('button:has-text("Siguiente"), button:has-text("Terminar"), button:has-text("End")')
    .first();
  if (await endButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await endButton.click();
    // Wait for return to videochat page
    await page.waitForURL('/videochat', { timeout: 10000 });
  }
}
