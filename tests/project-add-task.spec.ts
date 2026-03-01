import { test, expect } from '@playwright/test';

// Helper: navigate to projects page, optionally set auto-schedule, activate detail view
async function setupDetailView(page: any, autoSchedule?: boolean) {
  if (autoSchedule !== undefined) {
    // Set localStorage before navigating, so it's picked up on load
    await page.addInitScript((val: string) => {
      localStorage.setItem('dm-auto-schedule-today', val);
    }, autoSchedule ? 'true' : 'false');
  }
  await page.goto('./docs/projects/');
  // Make the detail view visible so the add-task form is accessible
  await page.evaluate(() => {
    const detail = document.getElementById('project-detail-view');
    if (detail) detail.classList.add('active');
  });
}

test.describe('Project Detail — Add Task Form (date & reminder popovers)', () => {

  // ── Date popover structure ──

  test('date icon button exists', async ({ page }) => {
    await setupDetailView(page, false);
    const dateIcon = page.locator('#pj-add-date-icon');
    await expect(dateIcon).toBeAttached();
  });

  test('clicking date icon opens popover with Today and Tomorrow buttons', async ({ page }) => {
    await setupDetailView(page, false);
    await page.locator('#pj-add-date-icon').click();
    const popover = page.locator('.pj-add-popover');
    await expect(popover).toBeVisible();

    // Has title
    await expect(popover.locator('.pj-add-popover-title')).toHaveText('Schedule');

    // Has Today and Tomorrow shortcut buttons
    const todayBtn = popover.locator('[data-date-offset="0"]');
    const tomorrowBtn = popover.locator('[data-date-offset="1"]');
    await expect(todayBtn).toBeVisible();
    await expect(todayBtn).toHaveText('Today');
    await expect(tomorrowBtn).toBeVisible();
    await expect(tomorrowBtn).toHaveText('Tomorrow');

    // Has custom date input and set button
    await expect(popover.locator('.pj-add-popover-input[type="date"]')).toBeVisible();
    await expect(popover.locator('.pj-add-popover-set')).toBeVisible();
  });

  test('clicking Today sets date chip to Today', async ({ page }) => {
    await setupDetailView(page, false);
    const dateChip = page.locator('#pj-add-date-chip');
    await expect(dateChip).toBeHidden();

    await page.locator('#pj-add-date-icon').click();
    await page.locator('.pj-add-popover [data-date-offset="0"]').click();

    // Chip should now be visible with "Today"
    await expect(dateChip).toBeVisible();
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Today');
    // Popover should be closed
    await expect(page.locator('.pj-add-popover')).toHaveCount(0);
  });

  test('clicking Tomorrow sets date chip to Tomorrow', async ({ page }) => {
    await setupDetailView(page, false);

    await page.locator('#pj-add-date-icon').click();
    await page.locator('.pj-add-popover [data-date-offset="1"]').click();

    const dateChip = page.locator('#pj-add-date-chip');
    await expect(dateChip).toBeVisible();
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Tomorrow');
    await expect(page.locator('.pj-add-popover')).toHaveCount(0);
  });

  test('custom date picker sets date chip', async ({ page }) => {
    await setupDetailView(page, false);

    await page.locator('#pj-add-date-icon').click();
    const popover = page.locator('.pj-add-popover');
    await expect(popover).toBeVisible();

    // Fill in a custom date
    await popover.locator('.pj-add-popover-input[type="date"]').fill('2026-06-15');
    await popover.locator('.pj-add-popover-set').click();

    const dateChip = page.locator('#pj-add-date-chip');
    await expect(dateChip).toBeVisible();
    // Should show "Jun 15"
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Jun 15');
    await expect(page.locator('.pj-add-popover')).toHaveCount(0);
  });

  test('clearing date chip removes date', async ({ page }) => {
    await setupDetailView(page, false);

    // Set a date first
    await page.locator('#pj-add-date-icon').click();
    await page.locator('.pj-add-popover [data-date-offset="0"]').click();
    await expect(page.locator('#pj-add-date-chip')).toBeVisible();

    // Clear it
    await page.locator('#pj-add-date-chip-clear').click();
    await expect(page.locator('#pj-add-date-chip')).toBeHidden();
    await expect(page.locator('#pj-add-date-icon')).toBeVisible();
  });

  test('date popover closes on Escape', async ({ page }) => {
    await setupDetailView(page, false);

    await page.locator('#pj-add-date-icon').click();
    await expect(page.locator('.pj-add-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.pj-add-popover')).toHaveCount(0);
  });

  test('clicking date chip re-opens date popover', async ({ page }) => {
    await setupDetailView(page, false);

    // Set a date
    await page.locator('#pj-add-date-icon').click();
    await page.locator('.pj-add-popover [data-date-offset="0"]').click();
    await expect(page.locator('#pj-add-date-chip')).toBeVisible();

    // Click on the chip (not the clear button) to re-open popover
    await page.locator('#pj-add-date-chip').click();
    await expect(page.locator('.pj-add-popover')).toBeVisible();
  });

  // ── Reminder popover structure ──

  test('reminder popover has shortcut buttons', async ({ page }) => {
    await setupDetailView(page, false);

    await page.locator('#pj-add-reminder-icon').click();
    const popover = page.locator('.pj-add-popover');
    await expect(popover).toBeVisible();

    await expect(popover.locator('.pj-add-popover-title')).toHaveText('Remind me');
    await expect(popover.locator('[data-rtype="30"]')).toHaveText('In 30 minutes');
    await expect(popover.locator('[data-rtype="60"]')).toHaveText('In 1 hour');
    await expect(popover.locator('[data-rtype="tomorrow9"]')).toHaveText('Tomorrow 9 AM');
    await expect(popover.locator('.pj-add-popover-input[type="datetime-local"]')).toBeVisible();
    await expect(popover.locator('.pj-add-popover-set')).toBeVisible();
  });

  test('clicking reminder shortcut sets reminder chip', async ({ page }) => {
    await setupDetailView(page, false);

    await page.locator('#pj-add-reminder-icon').click();
    await page.locator('.pj-add-popover [data-rtype="60"]').click();

    await expect(page.locator('#pj-add-reminder-chip')).toBeVisible();
    await expect(page.locator('.pj-add-popover')).toHaveCount(0);
  });

  test('reminder popover closes on Escape', async ({ page }) => {
    await setupDetailView(page, false);

    await page.locator('#pj-add-reminder-icon').click();
    await expect(page.locator('.pj-add-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.pj-add-popover')).toHaveCount(0);
  });

  test('opening date popover closes reminder popover and vice versa', async ({ page }) => {
    await setupDetailView(page, false);

    // Open reminder popover
    await page.locator('#pj-add-reminder-icon').click();
    await expect(page.locator('.pj-add-popover')).toBeVisible();

    // Open date popover — should close reminder popover
    // Use dispatchEvent because the reminder popover may visually overlap the date icon
    await page.locator('#pj-add-date-icon').dispatchEvent('click');
    // Only one popover should be visible (date)
    await expect(page.locator('.pj-add-popover')).toHaveCount(1);
    await expect(page.locator('.pj-add-popover .pj-add-popover-title')).toHaveText('Schedule');
  });

  // ── Auto-schedule today ──

  test('auto-schedule today: date chip shows Today on load when enabled', async ({ page }) => {
    await setupDetailView(page, true);

    const dateChip = page.locator('#pj-add-date-chip');
    await expect(dateChip).toBeVisible();
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Today');
  });

  test('auto-schedule today: no date chip on load when disabled', async ({ page }) => {
    await setupDetailView(page, false);

    const dateChip = page.locator('#pj-add-date-chip');
    await expect(dateChip).toBeHidden();
    await expect(page.locator('#pj-add-date-icon')).toBeVisible();
  });

  test('auto-schedule today: default is true (no localStorage key)', async ({ page }) => {
    // Navigate with clean state (no localStorage key set)
    await page.addInitScript(() => {
      localStorage.removeItem('dm-auto-schedule-today');
    });
    await page.goto('./docs/projects/');
    await page.evaluate(() => {
      const detail = document.getElementById('project-detail-view');
      if (detail) detail.classList.add('active');
    });

    const dateChip = page.locator('#pj-add-date-chip');
    await expect(dateChip).toBeVisible();
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Today');
  });

  test('auto-schedule today: toggling setting on sets date to Today', async ({ page }) => {
    await setupDetailView(page, false);
    await expect(page.locator('#pj-add-date-chip')).toBeHidden();

    // Simulate the settings change event (same as what the Settings modal dispatches)
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('dm-settings-changed', {
        detail: { key: 'dm-auto-schedule-today', value: true }
      }));
    });

    await expect(page.locator('#pj-add-date-chip')).toBeVisible();
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Today');
  });

  test('auto-schedule today: toggling setting off clears date', async ({ page }) => {
    await setupDetailView(page, true);
    await expect(page.locator('#pj-add-date-chip')).toBeVisible();

    // Simulate toggling off
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('dm-settings-changed', {
        detail: { key: 'dm-auto-schedule-today', value: false }
      }));
    });

    await expect(page.locator('#pj-add-date-chip')).toBeHidden();
  });

  test('auto-schedule today: toggling on does not override manually set date', async ({ page }) => {
    await setupDetailView(page, false);

    // Manually set Tomorrow
    await page.locator('#pj-add-date-icon').click();
    await page.locator('.pj-add-popover [data-date-offset="1"]').click();
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Tomorrow');

    // Simulate toggling auto-schedule on — should NOT override existing date
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('dm-settings-changed', {
        detail: { key: 'dm-auto-schedule-today', value: true }
      }));
    });

    // Should still show Tomorrow, not Today
    await expect(page.locator('#pj-add-date-chip-text')).toHaveText('Tomorrow');
  });
});
