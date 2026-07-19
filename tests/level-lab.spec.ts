import { expect, test } from '@playwright/test';

test('Level Lab renders complete v6 world art and starts the runtime controller witness', async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('kore.starterGuide.dismissed.v1', '1');
    window.localStorage.setItem('kore.story.profile.v4', JSON.stringify({
      version: 4,
      avatarStyle: 'kore-street-v1',
      avatar: {
        name: 'LEVEL LAB', avatarSet: 'crimson-ranger', lineage: 'human', bodyPreset: 'standard', bodyTone: 'tan',
        hairStyle: 'short', hairColor: '#15131a', outfit: 'kore-cyan', accessory: 'none'
      },
      createdAt: 1,
      updatedAt: 1,
      reviewedAt: 1
    }));
  });

  await page.goto('/?storyLevelLab=1&storyWorld=greenhollow&storyEndlessSeed=art-review&storyFloor=1&storyWitness=1');
  await page.locator('.title-screen').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Story', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Story', exact: true }).click();

  const hub = page.getByTestId('story-hub-screen');
  const lab = page.getByTestId('story-level-lab');
  await expect(hub).toHaveAttribute('data-hub-ready', 'true', { timeout: 30_000 });
  await expect(lab).toContainText('v6');
  await expect(lab).toContainText('art resolved');
  await expect(lab).toContainText('hazards 0');
  await expect(lab).toContainText('enemies 0');
  await expect(lab).toContainText('PASS');
  await expect(lab).toHaveAttribute('data-witness-steps', '6');
  const startX = Number(await hub.getAttribute('data-player-x'));
  await expect.poll(async () => Number(await hub.getAttribute('data-player-x')), { timeout: 15_000 }).toBeGreaterThan(startX + 2);

});
