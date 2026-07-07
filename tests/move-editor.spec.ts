import { expect, test } from '@playwright/test';

test('move editor loads playable moves and debounced autosaves manifest payloads', async ({ page }) => {
  const saves: unknown[] = [];
  await page.route('**/__kore/dev/save-character-manifest', async (route) => {
    saves.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, manifestPath: 'playwright-stub' })
    });
  });

  await page.goto('/move-editor.html');
  await expect(page.getByTestId('move-editor-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: 'Characters' }).locator('a').first()).toBeVisible();

  const firstRow = page.getByTestId('move-editor-row').first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await expect(firstRow.getByTestId('move-editor-preview')).toBeVisible();

  await firstRow.getByTestId('move-editor-label-input').fill('Playwright Test Strike');
  await firstRow.getByTestId('move-editor-description-input').fill('Fast test edit that proves autosave works.');
  await firstRow.getByTestId('move-editor-damage-input').fill('17');
  await firstRow.getByTestId('move-editor-tornado-toggle').check();
  await firstRow.getByTestId('move-editor-tracking-select').selectOption('strong');

  await expect.poll(() => saves.length, { timeout: 6000 }).toBeGreaterThan(0);
  const payload = saves.at(-1) as {
    moveOverrides?: Record<string, Record<string, unknown>>;
    projectiles?: unknown[];
    moveProjectiles?: Record<string, unknown[]>;
  };

  expect(payload.projectiles).toBeDefined();
  expect(payload.moveProjectiles).toBeDefined();
  expect(payload.moveOverrides).toBeDefined();
  expect(JSON.stringify(payload.moveOverrides)).toContain('Playwright Test Strike');
  expect(JSON.stringify(payload.moveOverrides)).toContain('Fast test edit that proves autosave works.');
  expect(JSON.stringify(payload.moveOverrides)).toContain('"damage":17');
  expect(JSON.stringify(payload.moveOverrides)).toContain('"tornado":true');
  expect(JSON.stringify(payload.moveOverrides)).toContain('"tracking":"strong"');
});
