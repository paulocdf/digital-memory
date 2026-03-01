import { test, expect, Page } from '@playwright/test';

// ── Test data ──

const CARD_IDS = ['rv-card-1', 'rv-card-2', 'rv-card-3'];

function makeCard(id: string, front: string, back: string, opts: Record<string, any> = {}) {
  return {
    id,
    front,
    back,
    tags: [],
    userId: 'test-user',
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReviewAt: Date.now() - 1000, // due now
    lastReviewedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...opts,
  };
}

const CARDS = [
  makeCard('rv-card-1', 'What is 2+2?', '4', { tags: ['math'] }),
  makeCard('rv-card-2', 'Capital of France?', 'Paris', { tags: ['geography'] }),
  makeCard('rv-card-3', 'Largest planet?', 'Jupiter', { tags: ['science', 'astronomy'] }),
];

// ── Helpers ──

/** Seed IDB with review cards. */
async function seedCards(page: Page, cards = CARDS) {
  await page.evaluate((cards) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('dm-notes', 13);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('reviewCards', 'readwrite');
        const store = tx.objectStore('reviewCards');
        cards.forEach((c: any) => store.put(c));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
      };
      req.onerror = (e: any) => reject(e.target.error);
    });
  }, cards);
}

/** Remove seeded test cards from IDB. */
async function cleanupCards(page: Page, cardIds = CARD_IDS) {
  await page.evaluate((ids) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('dm-notes', 13);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('reviewCards', 'readwrite');
        const store = tx.objectStore('reviewCards');
        ids.forEach((id: string) => store.delete(id));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
      };
      req.onerror = (e: any) => reject(e.target.error);
    });
  }, cardIds);
}

/** Navigate to review page, seed cards, and trigger loadQueue. */
async function setupReview(page: Page, cards = CARDS) {
  await page.goto('./docs/review/');
  await page.waitForFunction(() => !!(window as any).dmSync);
  await seedCards(page, cards);
  await page.evaluate(() => (window as any)._rvTest.loadQueue());
  // Wait for review UI to settle
  await page.waitForTimeout(300);
}

/** Navigate to review page with no cards seeded. */
async function setupEmpty(page: Page) {
  await page.goto('./docs/review/');
  await page.waitForFunction(() => !!(window as any).dmSync);
  // Clean any leftover cards
  await cleanupCards(page);
  await page.evaluate(() => (window as any)._rvTest.loadQueue());
  await page.waitForTimeout(300);
}

/** Mock Firebase auth so dmSync methods that require auth will work.
 *  Firebase Auth's `currentUser` is a getter on the prototype, so a plain
 *  assignment is silently ignored.  We use Object.defineProperty to override
 *  the getter on the instance itself. */
async function mockAuth(page: Page) {
  await page.evaluate(() => {
    const auth = (window as any).dmAuth;
    if (auth) {
      Object.defineProperty(auth, 'currentUser', {
        get() { return { uid: 'test-user' }; },
        configurable: true
      });
    } else {
      (window as any).dmAuth = { currentUser: { uid: 'test-user' } };
    }
  });
}

// ── Tests ──

test.describe('Flashcard Review', () => {
  test.afterEach(async ({ page }) => {
    await cleanupCards(page);
  });

  // ── Empty & Loading States ──

  test.describe('Empty States', () => {
    test('shows "No flashcards yet" when no cards exist', async ({ page }) => {
      await setupEmpty(page);

      const empty = page.locator('#review-empty');
      await expect(empty).toBeVisible();
      await expect(page.locator('#review-empty-title')).toHaveText('No flashcards yet');
      await expect(page.locator('#review-empty-msg')).toContainText('Create your first flashcard');
    });

    test('shows "All caught up" when no cards are due', async ({ page }) => {
      const futureCards = [
        makeCard('rv-card-1', 'Q1', 'A1', { nextReviewAt: Date.now() + 86400000 * 7 }),
        makeCard('rv-card-2', 'Q2', 'A2', { nextReviewAt: Date.now() + 86400000 * 14 }),
      ];
      await setupReview(page, futureCards);

      const empty = page.locator('#review-empty');
      await expect(empty).toBeVisible();
      await expect(page.locator('#review-empty-title')).toHaveText('All caught up!');
    });

    test('new card button is visible in empty state', async ({ page }) => {
      await setupEmpty(page);
      await expect(page.locator('#review-new-btn')).toBeVisible();
    });
  });

  // ── Stats Bar ──

  test.describe('Stats Bar', () => {
    test('shows correct due count', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-due-count')).toHaveText('3');
    });

    test('shows correct total count', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-total-count')).toHaveText('3');
    });

    test('shows correct reviewed today count', async ({ page }) => {
      // Mix of reviewed-today and not-yet-reviewed cards
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const cards = [
        makeCard('rv-card-1', 'Q1', 'A1', { lastReviewedAt: todayStart.getTime() + 1000 }),
        makeCard('rv-card-2', 'Q2', 'A2', { lastReviewedAt: null }),
        makeCard('rv-card-3', 'Q3', 'A3', { lastReviewedAt: todayStart.getTime() + 5000 }),
      ];
      await setupReview(page, cards);
      await expect(page.locator('#review-reviewed-count')).toHaveText('2');
    });

    test('stats bar visible during review', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-stats')).toBeVisible();
    });
  });

  // ── Card Display ──

  test.describe('Card Display', () => {
    test('shows front content of first due card', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-card-front-content')).toContainText('What is 2+2?');
    });

    test('shows card tags', async ({ page }) => {
      await setupReview(page);
      const tags = page.locator('.review-card-tag');
      await expect(tags).toHaveCount(1);
      await expect(tags.first()).toHaveText('math');
    });

    test('shows card meta (EF)', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-card-meta')).toContainText('EF: 2.50');
    });

    test('back content is hidden initially', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-card-back')).toBeHidden();
    });

    test('reveal button is visible', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-reveal-btn')).toBeVisible();
    });

    test('rating buttons are hidden initially', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-rating')).toBeHidden();
    });
  });

  // ── Reveal Answer ──

  test.describe('Reveal Answer', () => {
    test('clicking reveal shows back content', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await expect(page.locator('#review-card-back')).toBeVisible();
      await expect(page.locator('#review-card-back-content')).toContainText('4');
    });

    test('reveal hides the reveal button', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await expect(page.locator('#review-reveal-btn')).toBeHidden();
    });

    test('reveal shows rating buttons', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await expect(page.locator('#review-rating')).toBeVisible();
    });

    test('Space key reveals answer', async ({ page }) => {
      await setupReview(page);
      await page.keyboard.press('Space');
      await expect(page.locator('#review-card-back')).toBeVisible();
      await expect(page.locator('#review-rating')).toBeVisible();
    });

    test('all 6 rating buttons are present after reveal', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      const buttons = page.locator('.review-rate-btn');
      await expect(buttons).toHaveCount(6);
      for (let i = 0; i <= 5; i++) {
        await expect(page.locator(`.review-rate-btn[data-quality="${i}"]`)).toBeVisible();
      }
    });
  });

  // ── Rating & Review Flow ──

  test.describe('Rating', () => {
    test('clicking a rating button shows result', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      await expect(page.locator('#review-result')).toBeVisible();
      await expect(page.locator('#review-result-text')).toContainText('Next review');
    });

    test('rating hides the rating buttons', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="4"]');
      await expect(page.locator('#review-rating')).toBeHidden();
    });

    test('number key submits rating', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await page.keyboard.press('5');

      await expect(page.locator('#review-result')).toBeVisible();
      await expect(page.locator('#review-result-text')).toContainText('Next review');
    });

    test('rating updates due count', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-due-count')).toHaveText('3');

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      await expect(page.locator('#review-due-count')).toHaveText('2');
    });

    test('rating updates reviewed count', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-reviewed-count')).toHaveText('0');

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      await expect(page.locator('#review-reviewed-count')).toHaveText('1');
    });

    test('result text shows interval in days', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      // Quality 5 on first review: interval = 1 day
      await expect(page.locator('#review-result-text')).toContainText('1 day');
    });

    test('rating persists to IDB', async ({ page }) => {
      await setupReview(page);
      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      // Wait a bit for IDB write
      await page.waitForTimeout(500);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.repetitions).toBe(1);
      expect(card.interval).toBe(1);
      expect(card.lastReviewedAt).toBeTruthy();
    });
  });

  // ── Next Card / Progression ──

  test.describe('Card Progression', () => {
    test('next button advances to next card', async ({ page }) => {
      await setupReview(page);

      // Rate first card
      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');
      await page.click('#review-next-btn');

      // Should now show second card
      await expect(page.locator('#review-card-front-content')).toContainText('Capital of France?');
    });

    test('Enter key advances to next card', async ({ page }) => {
      await setupReview(page);

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');
      // Wait for the result to appear (async rating operation)
      await expect(page.locator('#review-result')).toBeVisible({ timeout: 3000 });
      await page.keyboard.press('Enter');

      await expect(page.locator('#review-card-front-content')).toContainText('Capital of France?');
    });

    test('back content is hidden after advancing', async ({ page }) => {
      await setupReview(page);

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');
      await page.click('#review-next-btn');

      await expect(page.locator('#review-card-back')).toBeHidden();
      await expect(page.locator('#review-reveal-btn')).toBeVisible();
    });

    test('progress bar updates as cards are reviewed', async ({ page }) => {
      await setupReview(page);

      // Initially 0%
      const bar = page.locator('#review-progress-bar');
      await expect(bar).toHaveCSS('width', '0px'); // 0% of container

      // Rate first card and advance
      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');
      await page.click('#review-next-btn');

      // Should now be ~33%
      const width = await bar.evaluate((el) => el.style.width);
      expect(width).toBe('33%');
    });

    test('next button shows "Done" on last card', async ({ page }) => {
      await setupReview(page);

      // Review all 3 cards
      for (let i = 0; i < 3; i++) {
        await page.click('#review-reveal-btn');
        await page.click('.review-rate-btn[data-quality="5"]');
        if (i < 2) {
          await page.click('#review-next-btn');
        }
      }

      await expect(page.locator('#review-next-btn')).toHaveText('Done');
    });

    test('clicking Done after last card shows completion state', async ({ page }) => {
      await setupReview(page);

      // Review all 3 cards
      for (let i = 0; i < 3; i++) {
        await page.click('#review-reveal-btn');
        await page.click('.review-rate-btn[data-quality="5"]');
        await page.click('#review-next-btn');
        if (i < 2) {
          await page.waitForTimeout(100);
        }
      }

      // After finishing all cards, should show "All caught up"
      await expect(page.locator('#review-empty')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('#review-empty-title')).toHaveText('All caught up!');
    });
  });

  // ── New Card Form ──

  test.describe('New Card Form', () => {
    test('new card button opens form', async ({ page }) => {
      await setupEmpty(page);

      await page.click('#review-new-btn');
      await expect(page.locator('#review-form')).toBeVisible();
      await expect(page.locator('#review-new-btn')).toBeHidden();
    });

    test('cancel button closes form', async ({ page }) => {
      await setupEmpty(page);

      await page.click('#review-new-btn');
      await page.click('#review-form-cancel');
      await expect(page.locator('#review-form')).toBeHidden();
      await expect(page.locator('#review-new-btn')).toBeVisible();
    });

    test('Escape key closes form', async ({ page }) => {
      await setupEmpty(page);

      await page.click('#review-new-btn');
      await page.locator('#review-form-front').focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('#review-form')).toBeHidden();
    });

    test('saving empty form shows validation error', async ({ page }) => {
      await setupEmpty(page);

      await page.click('#review-new-btn');
      await page.click('#review-form-save');

      // Both fields should have error class
      await expect(page.locator('#review-form-front')).toHaveClass(/review-field-error/);
      await expect(page.locator('#review-form-back')).toHaveClass(/review-field-error/);
    });

    test('validation error clears on input', async ({ page }) => {
      await setupEmpty(page);

      await page.click('#review-new-btn');
      await page.click('#review-form-save');

      // Error should be shown
      await expect(page.locator('#review-form-front')).toHaveClass(/review-field-error/);

      // Type in front field
      await page.fill('#review-form-front', 'Test question');
      await expect(page.locator('#review-form-front')).not.toHaveClass(/review-field-error/);
    });

    test('saving valid card creates it and reloads queue', async ({ page }) => {
      await setupEmpty(page);
      await mockAuth(page);

      await page.click('#review-new-btn');
      await page.fill('#review-form-front', 'Test Question');
      await page.fill('#review-form-back', 'Test Answer');
      await page.fill('#review-form-tags', 'test, demo');
      await page.click('#review-form-save');

      // Form should close
      await expect(page.locator('#review-form')).toBeHidden({ timeout: 3000 });

      // Card should appear in review (since it's immediately due)
      await expect(page.locator('#review-card-front-content')).toContainText('Test Question', { timeout: 3000 });

      // Cleanup the dynamically created card
      await page.evaluate(() => {
        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readwrite');
            const store = tx.objectStore('reviewCards');
            const getAll = store.getAll();
            getAll.onsuccess = () => {
              const cards = getAll.result;
              cards.forEach((c: any) => {
                if (c.front === 'Test Question') store.delete(c.id);
              });
              tx.oncomplete = () => { db.close(); resolve(); };
            };
            tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      });
    });

    test('Ctrl+Enter saves card from front textarea', async ({ page }) => {
      await setupEmpty(page);
      await mockAuth(page);

      await page.click('#review-new-btn');
      await page.fill('#review-form-front', 'Ctrl Enter Q');
      await page.fill('#review-form-back', 'Ctrl Enter A');
      await page.locator('#review-form-front').focus();
      await page.keyboard.press('Control+Enter');

      await expect(page.locator('#review-form')).toBeHidden({ timeout: 3000 });

      // Cleanup
      await page.evaluate(() => {
        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readwrite');
            const store = tx.objectStore('reviewCards');
            const getAll = store.getAll();
            getAll.onsuccess = () => {
              const cards = getAll.result;
              cards.forEach((c: any) => {
                if (c.front === 'Ctrl Enter Q') store.delete(c.id);
              });
              tx.oncomplete = () => { db.close(); resolve(); };
            };
            tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      });
    });
  });

  // ── Schedule List ──

  test.describe('Schedule List', () => {
    test('schedule list shows all cards', async ({ page }) => {
      await setupReview(page);
      const items = page.locator('.review-schedule-item');
      await expect(items).toHaveCount(3);
    });

    test('schedule items show front preview', async ({ page }) => {
      await setupReview(page);
      const firstItem = page.locator('.review-schedule-item').first();
      await expect(firstItem.locator('.review-schedule-item-front')).not.toHaveText('');
    });

    test('due cards show "Due now" label', async ({ page }) => {
      await setupReview(page);
      const dueLabels = page.locator('.review-due-now');
      // All 3 cards are due
      await expect(dueLabels).toHaveCount(3);
    });

    test('future cards show relative date', async ({ page }) => {
      const cards = [
        makeCard('rv-card-1', 'Q1', 'A1', { nextReviewAt: Date.now() + 86400000 * 3 }),
      ];
      await setupReview(page, cards);

      const dueLabel = page.locator('.review-schedule-item-due').first();
      await expect(dueLabel).toContainText('in 3 days');
    });

    test('schedule items show EF value', async ({ page }) => {
      await setupReview(page);
      const ef = page.locator('.review-schedule-item-ef').first();
      await expect(ef).toContainText('EF 2.5');
    });

    test('edit and delete buttons are present on each item', async ({ page }) => {
      await setupReview(page);
      const firstItem = page.locator('.review-schedule-item').first();
      await expect(firstItem.locator('.review-item-edit')).toBeAttached();
      await expect(firstItem.locator('.review-item-delete')).toBeAttached();
    });
  });

  // ── Inline Edit (Schedule) ──

  test.describe('Inline Edit', () => {
    test('clicking edit shows inline form with current content', async ({ page }) => {
      await setupReview(page);

      // Click edit on first schedule item
      await page.locator('.review-schedule-item').first().locator('.review-item-edit').click();

      const form = page.locator('.review-edit-form').first();
      await expect(form).toBeVisible();

      const frontTa = form.locator('.review-edit-front');
      const backTa = form.locator('.review-edit-back');
      await expect(frontTa).toHaveValue('What is 2+2?');
      await expect(backTa).toHaveValue('4');
    });

    test('edit form has tags input', async ({ page }) => {
      await setupReview(page);

      await page.locator('.review-schedule-item').first().locator('.review-item-edit').click();

      const form = page.locator('.review-edit-form').first();
      const tagsInput = form.locator('.review-edit-tags');
      await expect(tagsInput).toBeVisible();
      await expect(tagsInput).toHaveValue('math');
    });

    test('cancel button closes edit form', async ({ page }) => {
      await setupReview(page);

      await page.locator('.review-schedule-item').first().locator('.review-item-edit').click();
      await page.locator('.review-edit-cancel').first().click();

      // Edit form should be gone, original content restored
      await expect(page.locator('.review-edit-form')).toHaveCount(0);
      await expect(page.locator('.review-schedule-item-front').first()).toBeVisible();
    });

    test('Escape key closes edit form', async ({ page }) => {
      await setupReview(page);

      await page.locator('.review-schedule-item').first().locator('.review-item-edit').click();
      await page.locator('.review-edit-front').first().focus();
      await page.keyboard.press('Escape');

      await expect(page.locator('.review-edit-form')).toHaveCount(0);
    });

    test('saving edit updates card content', async ({ page }) => {
      await setupReview(page);

      await page.locator('.review-schedule-item').first().locator('.review-item-edit').click();

      const form = page.locator('.review-edit-form').first();
      await form.locator('.review-edit-front').fill('Updated question');
      await form.locator('.review-edit-back').fill('Updated answer');
      await form.locator('.review-edit-save').click();

      // Wait for loadQueue to re-render
      await page.waitForTimeout(500);

      // Verify the card was updated in IDB
      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.front).toBe('Updated question');
      expect(card.back).toBe('Updated answer');
    });

    test('saving edit updates tags', async ({ page }) => {
      await setupReview(page);

      await page.locator('.review-schedule-item').first().locator('.review-item-edit').click();

      const form = page.locator('.review-edit-form').first();
      await form.locator('.review-edit-tags').fill('updated-tag, another-tag');
      await form.locator('.review-edit-save').click();

      await page.waitForTimeout(500);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.tags).toEqual(['updated-tag', 'another-tag']);
    });

    test('Ctrl+Enter saves from edit form', async ({ page }) => {
      await setupReview(page);

      await page.locator('.review-schedule-item').first().locator('.review-item-edit').click();

      const form = page.locator('.review-edit-form').first();
      await form.locator('.review-edit-front').fill('Ctrl+Enter updated');
      await form.locator('.review-edit-front').focus();
      await page.keyboard.press('Control+Enter');

      await page.waitForTimeout(500);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.front).toBe('Ctrl+Enter updated');
    });
  });

  // ── Tag Filter ──

  test.describe('Tag Filter', () => {
    test('tag filter shows when cards have tags', async ({ page }) => {
      await setupReview(page);
      await expect(page.locator('#review-tag-filter')).toBeVisible();
    });

    test('tag filter has All chip plus one per unique tag', async ({ page }) => {
      await setupReview(page);
      const chips = page.locator('.review-tag-filter-chip');
      // Tags: math, geography, science, astronomy + All = 5
      await expect(chips).toHaveCount(5);
    });

    test('All chip is active by default', async ({ page }) => {
      await setupReview(page);
      const allChip = page.locator('.review-tag-filter-chip[data-tag=""]');
      await expect(allChip).toHaveClass(/active/);
    });

    test('clicking tag chip filters schedule list', async ({ page }) => {
      await setupReview(page);

      // Click "math" tag
      await page.locator('.review-tag-filter-chip[data-tag="math"]').click();

      // Only 1 card has math tag
      const items = page.locator('.review-schedule-item');
      await expect(items).toHaveCount(1);
    });

    test('clicking All chip shows all cards again', async ({ page }) => {
      await setupReview(page);

      // Filter by math
      await page.locator('.review-tag-filter-chip[data-tag="math"]').click();
      await expect(page.locator('.review-schedule-item')).toHaveCount(1);

      // Click All
      await page.locator('.review-tag-filter-chip[data-tag=""]').click();
      await expect(page.locator('.review-schedule-item')).toHaveCount(3);
    });

    test('tag filter hidden when no cards have tags', async ({ page }) => {
      const noTagCards = [
        makeCard('rv-card-1', 'Q1', 'A1', { tags: [] }),
      ];
      await setupReview(page, noTagCards);
      await expect(page.locator('#review-tag-filter')).toBeHidden();
    });
  });

  // ── Delete Card ──

  test.describe('Delete Card', () => {
    test('delete button triggers confirmation dialog', async ({ page }) => {
      await setupReview(page);

      // Click delete on first schedule item
      await page.locator('.review-schedule-item').first().locator('.review-item-delete').click();

      // Confirm dialog should appear
      await expect(page.locator('.dm-confirm-overlay')).toBeVisible({ timeout: 2000 });
      await expect(page.locator('.dm-confirm-title')).toHaveText('Delete Flashcard');
    });

    test('confirming delete removes card', async ({ page }) => {
      await setupReview(page);

      const initialCount = await page.locator('.review-schedule-item').count();

      await page.locator('.review-schedule-item').first().locator('.review-item-delete').click();

      // Confirm
      await page.locator('.dm-confirm-ok').click();

      // Wait for animation and reload
      await page.waitForTimeout(500);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card).toBeUndefined();
    });

    test('cancelling delete keeps card', async ({ page }) => {
      await setupReview(page);

      await page.locator('.review-schedule-item').first().locator('.review-item-delete').click();

      // Cancel
      await page.locator('.dm-confirm-cancel').click();

      // Card should still be in schedule
      await expect(page.locator('.review-schedule-item')).toHaveCount(3);
    });
  });

  // ── Keyboard Shortcuts ──

  test.describe('Keyboard Shortcuts', () => {
    test('Space does not trigger reveal when typing in textarea', async ({ page }) => {
      await setupReview(page);

      // Open new card form
      await page.click('#review-new-btn');
      await page.locator('#review-form-front').focus();
      await page.keyboard.press('Space');

      // Card should still show reveal button (Space was consumed by textarea)
      // The new card form should still be open
      await expect(page.locator('#review-form')).toBeVisible();
    });

    test('number keys do not rate when not in review mode', async ({ page }) => {
      await setupEmpty(page);
      await page.keyboard.press('5');
      // Nothing should crash; the page is in empty state
      await expect(page.locator('#review-empty')).toBeVisible();
    });
  });

  // ── SM-2 Algorithm (via reviewCard) ──

  test.describe('SM-2 Algorithm', () => {
    test('quality 5 first review: interval = 1, repetitions = 1', async ({ page }) => {
      const cards = [makeCard('rv-card-1', 'Q1', 'A1')];
      await setupReview(page, cards);

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      await page.waitForTimeout(300);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.repetitions).toBe(1);
      expect(card.interval).toBe(1);
      expect(card.easeFactor).toBeGreaterThan(2.5); // quality 5 increases EF
    });

    test('quality 0 resets repetitions and sets interval to 1', async ({ page }) => {
      const cards = [makeCard('rv-card-1', 'Q1', 'A1', { repetitions: 5, interval: 30, easeFactor: 2.5 })];
      await setupReview(page, cards);

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="0"]');

      await page.waitForTimeout(300);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.repetitions).toBe(0);
      expect(card.interval).toBe(1);
    });

    test('quality 3 (correct but hard) still increments repetitions', async ({ page }) => {
      const cards = [makeCard('rv-card-1', 'Q1', 'A1')];
      await setupReview(page, cards);

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="3"]');

      await page.waitForTimeout(300);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.repetitions).toBe(1);
      expect(card.interval).toBe(1);
      // EF should decrease for quality 3
      expect(card.easeFactor).toBeLessThan(2.5);
    });

    test('second correct review sets interval to 6 days', async ({ page }) => {
      // Card already has 1 repetition (simulating first successful review)
      const cards = [makeCard('rv-card-1', 'Q1', 'A1', {
        repetitions: 1,
        interval: 1,
        easeFactor: 2.6,
      })];
      await setupReview(page, cards);

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      await page.waitForTimeout(300);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.repetitions).toBe(2);
      expect(card.interval).toBe(6);
    });

    test('third+ review uses interval * EF', async ({ page }) => {
      // Card already has 2 repetitions
      const cards = [makeCard('rv-card-1', 'Q1', 'A1', {
        repetitions: 2,
        interval: 6,
        easeFactor: 2.5,
      })];
      await setupReview(page, cards);

      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="5"]');

      await page.waitForTimeout(300);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.repetitions).toBe(3);
      // 6 * 2.6 = 15.6, rounded to 16 (EF increases from 2.5 to 2.6 with quality 5)
      expect(card.interval).toBe(16);
    });

    test('EF floor is 1.3 (never goes below)', async ({ page }) => {
      // Card with already low EF
      const cards = [makeCard('rv-card-1', 'Q1', 'A1', {
        repetitions: 0,
        interval: 1,
        easeFactor: 1.3,
      })];
      await setupReview(page, cards);

      // Rate as quality 0 to try to push EF below 1.3
      await page.click('#review-reveal-btn');
      await page.click('.review-rate-btn[data-quality="0"]');

      await page.waitForTimeout(300);

      const card = await page.evaluate((id) => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get(id);
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      }, 'rv-card-1');

      expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
    });
  });

  // ── Data Layer (dmSync API) ──

  test.describe('Data Layer API', () => {
    test('createReviewCard stores card in IDB', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await mockAuth(page);

      const card = await page.evaluate(() => {
        return (window as any).dmSync.createReviewCard('API Test Q', 'API Test A', ['api-test']);
      });

      expect(card.front).toBe('API Test Q');
      expect(card.back).toBe('API Test A');
      expect(card.tags).toEqual(['api-test']);
      expect(card.easeFactor).toBe(2.5);
      expect(card.interval).toBe(0);
      expect(card.repetitions).toBe(0);

      // Cleanup
      await page.evaluate((id: string) => (window as any).dmSync.deleteReviewCard(id), card.id);
    });

    test('createReviewCard rejects empty front', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await mockAuth(page);

      const error = await page.evaluate(() => {
        return (window as any).dmSync.createReviewCard('', 'answer').catch((e: Error) => e.message);
      });
      expect(error).toContain('required');
    });

    test('createReviewCard rejects empty back', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await mockAuth(page);

      const error = await page.evaluate(() => {
        return (window as any).dmSync.createReviewCard('question', '').catch((e: Error) => e.message);
      });
      expect(error).toContain('required');
    });

    test('getReviewCards(false) returns all cards', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await seedCards(page);

      const cards = await page.evaluate(() => (window as any).dmSync.getReviewCards(false));
      expect(cards.length).toBe(3);
    });

    test('getReviewCards(true) returns only due cards', async ({ page }) => {
      const mixedCards = [
        makeCard('rv-card-1', 'Due Q', 'Due A'),
        makeCard('rv-card-2', 'Future Q', 'Future A', { nextReviewAt: Date.now() + 86400000 * 30 }),
      ];
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await seedCards(page, mixedCards);

      const dueCards = await page.evaluate(() => (window as any).dmSync.getReviewCards(true));
      expect(dueCards.length).toBe(1);
      expect(dueCards[0].front).toBe('Due Q');
    });

    test('getDueCount returns correct count', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await seedCards(page);

      const count = await page.evaluate(() => (window as any).dmSync.getDueCount());
      expect(count).toBe(3);
    });

    test('deleteReviewCard removes card from IDB', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await mockAuth(page);
      await seedCards(page, [makeCard('rv-card-1', 'Q', 'A')]);

      await page.evaluate(() => (window as any).dmSync.deleteReviewCard('rv-card-1'));

      const cards = await page.evaluate(() => (window as any).dmSync.getReviewCards(false));
      expect(cards.length).toBe(0);
    });

    test('updateReviewCardContent updates content and tags', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await mockAuth(page);
      await seedCards(page, [makeCard('rv-card-1', 'Old Q', 'Old A', { tags: ['old'] })]);

      await page.evaluate(() => {
        return (window as any).dmSync.updateReviewCardContent('rv-card-1', {
          front: 'New Q',
          back: 'New A',
          tags: ['new-tag']
        });
      });

      const card = await page.evaluate(() => {
        return new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('dm-notes', 13);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('reviewCards', 'readonly');
            const get = tx.objectStore('reviewCards').get('rv-card-1');
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = (e: any) => { db.close(); reject(e.target.error); };
          };
        });
      });

      expect(card.front).toBe('New Q');
      expect(card.back).toBe('New A');
      expect(card.tags).toEqual(['new-tag']);
      // SRS fields should be preserved
      expect(card.easeFactor).toBe(2.5);
      expect(card.repetitions).toBe(0);
    });

    test('reviewCard dispatches dm-review-updated event', async ({ page }) => {
      await page.goto('./docs/review/');
      await page.waitForFunction(() => !!(window as any).dmSync);
      await mockAuth(page);
      await seedCards(page, [makeCard('rv-card-1', 'Q', 'A')]);

      const eventFired = await page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          window.addEventListener('dm-review-updated', () => resolve(true), { once: true });
          (window as any).dmSync.reviewCard('rv-card-1', 4);
          setTimeout(() => resolve(false), 2000);
        });
      });

      expect(eventFired).toBe(true);
    });
  });
});
