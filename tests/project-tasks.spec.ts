import { test, expect, Page } from '@playwright/test';

// ── Test data ──

const PROJECT_ID = 'test-pj-tasks-1';
const PROJECT = {
  id: PROJECT_ID,
  userId: 'test-user',
  name: 'Task Actions Project',
  color: '#64b5f6',
  description: 'Test project for delete and done',
  deadline: null,
  archived: false,
  order: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function makeTask(id: string, title: string, order: number, opts: Record<string, any> = {}) {
  return {
    id,
    userId: 'test-user',
    title,
    projectId: PROJECT_ID,
    order,
    done: false,
    status: 'active',
    bujoType: 'task',
    bujoState: 'open',
    kanbanStatus: 'todo',
    estimatedMin: 25,
    actualMin: null,
    completedAt: null,
    parentId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...opts,
  };
}

const TASKS = [
  makeTask('pjt-task-1', 'Alpha Task', 1),
  makeTask('pjt-task-2', 'Beta Task', 2),
  makeTask('pjt-task-3', 'Gamma Task', 3),
];

const ALL_TASK_IDS = TASKS.map((t) => t.id);

// ── Helpers ──

/** Seed IDB with a project and its tasks. */
async function seedData(page: Page, tasks = TASKS) {
  await page.evaluate(
    ({ project, tasks }) => {
      const dmSync = (window as any).dmSync;
      const taskPromises = tasks.map((t: any) => dmSync.putTodo(t));
      const projectPromise = new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('dm-notes', 13);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put(project);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
      return Promise.all([...taskPromises, projectPromise]);
    },
    { project: PROJECT, tasks }
  );
}

/** Remove seeded test data from IDB. */
async function cleanupData(page: Page, taskIds = ALL_TASK_IDS) {
  await page.evaluate(
    ({ taskIds, projectId }) => {
      const dmSync = (window as any).dmSync;
      const taskPromises = taskIds.map((id: string) =>
        dmSync.deleteTodo(id).catch(() => {})
      );
      const projectPromise = new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('dm-notes', 13);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').delete(projectId);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
      return Promise.all([...taskPromises, projectPromise]);
    },
    { taskIds, projectId: PROJECT_ID }
  );
}

/**
 * Navigate to projects page, seed IDB, and render the project detail view.
 * Uses _pjTest API to bypass auth and directly show the detail view.
 */
async function setupProjectDetail(page: Page, tasks = TASKS) {
  await page.goto('./docs/projects/');
  await page.waitForFunction(() => !!(window as any).dmSync && !!(window as any).dmSync.putTodo);
  await seedData(page, tasks);

  // Use the test API to populate _projects and show detail view
  await page.evaluate((project) => {
    const pjTest = (window as any)._pjTest;
    pjTest.setProjects([project]);
    pjTest.showDetail(project.id);
  }, PROJECT);

  // Wait for task items to render (renderDetail fetches from IDB async)
  await page.waitForSelector('.project-task-item', { timeout: 5000 });
}

// ── Tests ──

test.describe('Project Detail — Task Actions', () => {
  test.afterEach(async ({ page }) => {
    await cleanupData(page);
  });

  test.describe('Delete Tasks', () => {
    test('delete button is visible on task row hover', async ({ page }) => {
      await setupProjectDetail(page);

      const firstTask = page.locator('.project-task-item').first();
      const deleteBtn = firstTask.locator('.project-task-delete');

      // Before hover, delete button has opacity 0
      await expect(deleteBtn).toBeAttached();

      // After hover, delete button becomes visible
      await firstTask.hover();
      await expect(deleteBtn).toHaveCSS('opacity', '1');
    });

    test('clicking delete removes task and shows undo toast', async ({ page }) => {
      await setupProjectDetail(page);

      // Verify 3 tasks initially
      await expect(page.locator('.project-task-item')).toHaveCount(3);

      // Hover over first task and click delete
      const firstTask = page.locator('.project-task-item').first();
      await firstTask.hover();
      await firstTask.locator('.project-task-delete').click();

      // Task should be removed from the list
      await expect(page.locator('.project-task-item')).toHaveCount(2);

      // Undo toast should appear
      const toast = page.locator('.pj-toast');
      await expect(toast).toBeVisible();
      await expect(toast.locator('.pj-toast-label')).toContainText('Deleted');
      await expect(toast.locator('.pj-toast-btn')).toHaveText('Undo');
    });

    test('undo restores deleted task', async ({ page }) => {
      await setupProjectDetail(page);
      await expect(page.locator('.project-task-item')).toHaveCount(3);

      // Delete first task
      const firstTask = page.locator('.project-task-item').first();
      await firstTask.hover();
      await firstTask.locator('.project-task-delete').click();
      await expect(page.locator('.project-task-item')).toHaveCount(2);

      // Click undo
      const undoBtn = page.locator('.pj-toast .pj-toast-btn');
      await expect(undoBtn).toBeVisible();
      await undoBtn.click();

      // Task should be restored
      await expect(page.locator('.project-task-item')).toHaveCount(3);
    });

    test('delete updates progress bar', async ({ page }) => {
      await setupProjectDetail(page);

      const progressLabel = page.locator('#project-progress-label');
      await expect(progressLabel).toContainText('0 of 3');

      // Delete one task
      const firstTask = page.locator('.project-task-item').first();
      await firstTask.hover();
      await firstTask.locator('.project-task-delete').click();

      // Progress should update to reflect fewer total tasks
      await expect(progressLabel).toContainText('of 2');
    });

    test('toast auto-dismisses after timeout', async ({ page }) => {
      await setupProjectDetail(page);

      const firstTask = page.locator('.project-task-item').first();
      await firstTask.hover();
      await firstTask.locator('.project-task-delete').click();

      const toast = page.locator('.pj-toast');
      await expect(toast).toBeVisible();

      // Wait for auto-dismiss (3s + 300ms fade)
      await page.waitForTimeout(3500);
      await expect(toast).not.toBeAttached();
    });

    test('deleting task persists to IDB with deletedAt', async ({ page }) => {
      await setupProjectDetail(page);

      // Delete first task
      const firstTask = page.locator('.project-task-item').first();
      await firstTask.hover();
      await firstTask.locator('.project-task-delete').click();
      await page.waitForTimeout(500);

      // Check IDB directly
      const taskState = await page.evaluate((taskId) => {
        return (window as any).dmSync.getTodoIncludingTrashed(taskId).then((t: any) => ({
          status: t.status,
          deletedAt: t.deletedAt,
        }));
      }, 'pjt-task-1');

      expect(taskState.status).toBe('deleted');
      expect(taskState.deletedAt).toBeTruthy();
    });
  });

  test.describe('Complete Tasks', () => {
    test('clicking checkbox marks task as done with strikethrough', async ({ page }) => {
      await setupProjectDetail(page);

      // Click first task's checkbox to complete
      const checkbox = page.locator('.project-task-checkbox').first();
      await checkbox.click();

      // Wait for re-render
      await page.waitForTimeout(500);

      // Find the checked checkbox
      const doneCheckbox = page.locator('.project-task-checkbox.checked');
      await expect(doneCheckbox).toHaveCount(1);

      // Title should have strikethrough class
      const doneTitle = page.locator('.project-task-title.done');
      await expect(doneTitle).toHaveCount(1);
    });

    test('completing task shows undo toast with checkmark', async ({ page }) => {
      await setupProjectDetail(page);

      const checkbox = page.locator('.project-task-checkbox').first();
      await checkbox.click();

      // Undo toast should appear with completion styling
      const toast = page.locator('.pj-toast');
      await expect(toast).toBeVisible();
      await expect(toast).toHaveClass(/pj-toast-done/);
      await expect(toast.locator('.pj-toast-icon')).toBeVisible();
      await expect(toast.locator('.pj-toast-label')).toContainText('Completed');
      await expect(toast.locator('.pj-toast-btn')).toHaveText('Undo');
    });

    test('undo reverts task completion', async ({ page }) => {
      await setupProjectDetail(page);

      // Complete first task
      const checkbox = page.locator('.project-task-checkbox').first();
      await checkbox.click();
      await page.waitForTimeout(500);

      // Verify it's done
      await expect(page.locator('.project-task-checkbox.checked')).toHaveCount(1);

      // Click undo
      await page.locator('.pj-toast .pj-toast-btn').click();
      await page.waitForTimeout(500);

      // All tasks should be open again
      await expect(page.locator('.project-task-checkbox.checked')).toHaveCount(0);
    });

    test('completing task updates progress bar', async ({ page }) => {
      await setupProjectDetail(page);

      const progressLabel = page.locator('#project-progress-label');
      await expect(progressLabel).toContainText('0 of 3');

      // Complete first task
      const checkbox = page.locator('.project-task-checkbox').first();
      await checkbox.click();
      await page.waitForTimeout(500);

      // Progress should show 1 of 3
      await expect(progressLabel).toContainText('1 of 3');
    });

    test('clicking done checkbox reopens task', async ({ page }) => {
      await setupProjectDetail(page);

      // Complete first task
      const checkbox = page.locator('.project-task-checkbox').first();
      await checkbox.click();
      await page.waitForTimeout(500);

      // Dismiss the done toast by waiting
      await page.waitForTimeout(3500);

      // Now click the done checkbox to reopen
      const doneCheckbox = page.locator('.project-task-checkbox.checked').first();
      await doneCheckbox.click();
      await page.waitForTimeout(500);

      // All tasks should be open
      await expect(page.locator('.project-task-checkbox.checked')).toHaveCount(0);
      await expect(page.locator('#project-progress-label')).toContainText('0 of 3');
    });

    test('completing task persists to IDB', async ({ page }) => {
      await setupProjectDetail(page);

      // Complete first task
      const checkbox = page.locator('.project-task-checkbox').first();
      await checkbox.click();
      await page.waitForTimeout(500);

      // Check IDB directly
      const taskState = await page.evaluate((taskId) => {
        return (window as any).dmSync.getTodo(taskId).then((t: any) => ({
          done: t.done,
          status: t.status,
          bujoState: t.bujoState,
          kanbanStatus: t.kanbanStatus,
        }));
      }, 'pjt-task-1');

      expect(taskState.done).toBe(true);
      expect(taskState.status).toBe('done');
      expect(taskState.bujoState).toBe('done');
      expect(taskState.kanbanStatus).toBe('done');
    });

    test('completing all tasks shows 100% progress', async ({ page }) => {
      await setupProjectDetail(page);

      const progressLabel = page.locator('#project-progress-label');

      // Complete all 3 tasks one by one
      for (let i = 0; i < 3; i++) {
        // Wait for previous toast to dismiss
        if (i > 0) await page.waitForTimeout(3500);
        const checkbox = page.locator('.project-task-checkbox:not(.checked)').first();
        await checkbox.click();
        await page.waitForTimeout(500);
      }

      await expect(progressLabel).toContainText('3 of 3');
      await expect(progressLabel).toContainText('100%');
    });
  });
});
