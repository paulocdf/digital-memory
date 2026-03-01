import { test, expect, Page } from '@playwright/test';

// ── Test data ──

const PROJECT_ID = 'test-project-1';
const PROJECT = {
  id: PROJECT_ID,
  userId: 'test-user',
  name: 'Test Project',
  color: '#64b5f6',
  description: '',
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
    estimatedMin: 25,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...opts,
  };
}

const TASKS = [
  makeTask('proj-task-1', 'Project Task Alpha', 1),
  makeTask('proj-task-2', 'Project Task Beta', 2),
  makeTask('proj-task-3', 'Project Task Gamma', 3),
  makeTask('proj-task-4', 'Project Task Delta', 4),
  makeTask('proj-task-5', 'Project Task Epsilon', 5),
  makeTask('proj-task-6', 'Project Task Zeta', 6),
];

// ── Helpers ──

/** Seed IDB with a project and its tasks so dmSync can query them. */
async function seedProjectData(page: Page) {
  await page.evaluate(
    ({ project, tasks }) => {
      const dmSync = (window as any).dmSync;
      // putTodo is public and works without auth
      const taskPromises = tasks.map((t: any) => dmSync.putTodo(t));
      // For the project, use raw IDB since createProject requires auth
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
    { project: PROJECT, tasks: TASKS }
  );
}

/** Remove seeded test data from IDB. */
async function cleanupProjectData(page: Page) {
  await page.evaluate(
    ({ taskIds, projectId }) => {
      const dmSync = (window as any).dmSync;
      const taskPromises = taskIds.map((id: string) => dmSync.deleteTodo(id));
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
    { taskIds: TASKS.map((t) => t.id), projectId: PROJECT_ID }
  );
}

/**
 * Start the pomodoro timer on a project task.
 * start() chains getTodo → getProject → initAndStart → enterFocusMode,
 * so activeProjectId is populated before updateUpNext() runs.
 */
async function startProjectTask(page: Page, taskId: string, taskTitle: string) {
  await page.evaluate(
    ({ id, title }) => {
      (window as any).dmPomodoro.start(id, title);
    },
    { id: taskId, title: taskTitle }
  );
  // start() opens focus mode; wait for the overlay to be visible
  await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();
  // Pause immediately so timer ticks don't interfere with assertions
  await page.evaluate(() => (window as any).dmPomodoro.pause());
}

// ── Tests ──

test.describe('Pomodoro Project-Aware Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmPomodoro);
    await page.waitForFunction(() => !!(window as any).dmSync && !!(window as any).dmSync.putTodo);
    await seedProjectData(page);
  });

  test.afterEach(async ({ page }) => {
    // Close timer if open
    await page.evaluate(() => {
      try { (window as any).dmPomodoro.close(); } catch (_) {}
    });
    await cleanupProjectData(page);
  });

  test.describe('Up Next Strip — Project Tasks', () => {
    test('shows Up Next strip immediately on initial focus entry', async ({ page }) => {
      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      // Up Next should appear on the initial focus entry — no collapse/expand needed
      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      const upNextList = page.locator('#focus-upnext-list');
      await expect(upNextList).toBeVisible();
      await expect(upNextList.locator('.pomodoro-focus-upnext-item').first()).toContainText('Project Task Beta');
    });

    test('Up Next shows up to 5 tasks from the project', async ({ page }) => {
      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      const items = page.locator('#focus-upnext-list .pomodoro-focus-upnext-item');
      // We have 6 tasks, timing task 1, so up to 5 remaining should show
      await expect(items).toHaveCount(5);

      // Verify ordering by order field
      await expect(items.nth(0)).toContainText('Project Task Beta');
      await expect(items.nth(1)).toContainText('Project Task Gamma');
      await expect(items.nth(2)).toContainText('Project Task Delta');
      await expect(items.nth(3)).toContainText('Project Task Epsilon');
      await expect(items.nth(4)).toContainText('Project Task Zeta');
    });

    test('Up Next skips done tasks in project', async ({ page }) => {
      // Mark task 2 as done before starting
      await page.evaluate(() => {
        const dmSync = (window as any).dmSync;
        return dmSync.getTodo('proj-task-2').then((t: any) => {
          t.done = true;
          t.status = 'done';
          return dmSync.putTodo(t);
        });
      });

      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      const items = page.locator('#focus-upnext-list .pomodoro-focus-upnext-item');
      // Task 2 is done, so first up-next should be Task 3
      await expect(items.first()).toContainText('Project Task Gamma');
    });

    test('Up Next hides when timing the last project task', async ({ page }) => {
      await startProjectTask(page, 'proj-task-6', 'Project Task Zeta');

      // No tasks after the last one — strip should be hidden
      // Give the async IDB query time to resolve
      await page.waitForTimeout(1000);
      await expect(page.locator('#focus-panel-upnext')).toBeHidden();
    });

    test('Up Next shows subtasks interleaved after their parent', async ({ page }) => {
      // Add a subtask to proj-task-2
      await page.evaluate(
        ({ makeSubtask }) => {
          return (window as any).dmSync.putTodo(makeSubtask);
        },
        {
          makeSubtask: makeTask('proj-sub-2a', 'Subtask of Beta', 1, {
            parentId: 'proj-task-2',
          }),
        }
      );

      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      const items = page.locator('#focus-upnext-list .pomodoro-focus-upnext-item');
      // After task 1: task 2, then subtask of beta, then task 3, etc.
      await expect(items.nth(0)).toContainText('Project Task Beta');
      await expect(items.nth(1)).toContainText('Subtask of Beta');
      await expect(items.nth(2)).toContainText('Project Task Gamma');

      // Clean up the extra subtask
      await page.evaluate(() => (window as any).dmSync.deleteTodo('proj-sub-2a'));
    });

    test('Up Next still shows after exiting and re-entering focus mode', async ({ page }) => {
      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      // Exit focus mode
      await page.locator('#focus-collapse').click();
      await expect(page.locator('#pomodoro-focus-overlay')).toBeHidden();

      // Re-enter focus mode
      await page.locator('#pomodoro-expand').click();
      await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();

      // Up Next should still show
      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });
      await expect(
        page.locator('#focus-upnext-list .pomodoro-focus-upnext-item').first()
      ).toContainText('Project Task Beta');
    });
  });

  test.describe('Next Button — Project Task Auto-Advance', () => {
    test('Next button dispatches dm-pomodoro-completed with projectId', async ({ page }) => {
      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      // Listen for the completion event
      const completionDetail = page.evaluate(() => {
        return new Promise<any>((resolve) => {
          window.addEventListener(
            'dm-pomodoro-completed',
            (e: any) => resolve(e.detail),
            { once: true }
          );
        });
      });

      // Click Next button
      await page.locator('#focus-next').click();

      const detail = await completionDetail;
      expect(detail.todoId).toBe('proj-task-1');
      expect(detail.projectId).toBe(PROJECT_ID);
    });

    test('Next button auto-advances to next project task', async ({ page }) => {
      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      // Click Next — should complete task 1 and start task 2
      await page.locator('#focus-next').click();

      // Wait for the auto-advance (100ms setTimeout in the code)
      await expect(page.locator('#focus-title')).toContainText('Project Task Beta', {
        timeout: 3000,
      });
    });

    test('Next button skips done tasks when advancing within project', async ({ page }) => {
      // Mark task 2 as done
      await page.evaluate(() => {
        const dmSync = (window as any).dmSync;
        return dmSync.getTodo('proj-task-2').then((t: any) => {
          t.done = true;
          t.status = 'done';
          return dmSync.putTodo(t);
        });
      });

      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      // Click Next — should skip task 2 (done) and go to task 3
      await page.locator('#focus-next').click();

      await expect(page.locator('#focus-title')).toContainText('Project Task Gamma', {
        timeout: 3000,
      });
    });

    test('Next button closes timer when no more project tasks remain', async ({ page }) => {
      await startProjectTask(page, 'proj-task-6', 'Project Task Zeta');

      // Click Next on the last task — should complete and close (no next task)
      await page.locator('#focus-next').click();

      // Timer should close (focus overlay hidden, widget hidden)
      await expect(page.locator('#pomodoro-focus-overlay')).toBeHidden({ timeout: 3000 });
      await expect(page.locator('#pomodoro-timer')).toBeHidden({ timeout: 3000 });
    });

    test('Next button advances sequentially through multiple project tasks', async ({ page }) => {
      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      // Advance from task 1 → task 2
      await page.locator('#focus-next').click();
      await expect(page.locator('#focus-title')).toContainText('Project Task Beta', {
        timeout: 3000,
      });

      // Wait for the new start() to fully initialize (IDB reads for project + task)
      await page.waitForTimeout(500);

      // Advance from task 2 → task 3
      await page.locator('#focus-next').click();
      await expect(page.locator('#focus-title')).toContainText('Project Task Gamma', {
        timeout: 3000,
      });
    });

    test('Up Next updates after advancing to next task', async ({ page }) => {
      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      // Verify initial Up Next shows Beta first
      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });
      await expect(
        page.locator('#focus-upnext-list .pomodoro-focus-upnext-item').first()
      ).toContainText('Project Task Beta');

      // Advance to task 2
      await page.locator('#focus-next').click();
      await expect(page.locator('#focus-title')).toContainText('Project Task Beta', {
        timeout: 3000,
      });

      // Up Next should now show Gamma first (Beta is the active task)
      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });
      await expect(
        page.locator('#focus-upnext-list .pomodoro-focus-upnext-item').first()
      ).toContainText('Project Task Gamma');
    });
  });

  test.describe('Non-Project Tasks (Fallback Behavior)', () => {
    test('Up Next hides when timing a non-project task on non-inbox page', async ({ page }) => {
      // Start a task with no projectId (not in IDB seeded data, so no project)
      await page.evaluate(() => {
        (window as any).dmPomodoro.start('standalone-task', 'Standalone Task');
      });
      await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();
      await page.evaluate(() => (window as any).dmPomodoro.pause());

      // On the home page (not inbox), dmTodoList is undefined
      // Up Next should be hidden since there's no project and no dmTodoList
      await page.waitForTimeout(500);
      await expect(page.locator('#focus-panel-upnext')).toBeHidden();
    });

    test('Next button completes non-project task without advancing', async ({ page }) => {
      await page.evaluate(() => {
        (window as any).dmPomodoro.start('standalone-task', 'Standalone Task');
      });
      await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();
      await page.evaluate(() => (window as any).dmPomodoro.pause());

      const completionDetail = page.evaluate(() => {
        return new Promise<any>((resolve) => {
          window.addEventListener(
            'dm-pomodoro-completed',
            (e: any) => resolve(e.detail),
            { once: true }
          );
        });
      });

      await page.locator('#focus-next').click();

      const detail = await completionDetail;
      expect(detail.todoId).toBe('standalone-task');
      expect(detail.projectId).toBeNull();

      // Timer should close (no dmTodoList available on this page)
      await expect(page.locator('#pomodoro-focus-overlay')).toBeHidden({ timeout: 3000 });
    });
  });

  test.describe('_findNextProjectTasks Logic', () => {
    test('ignores tasks from other projects', async ({ page }) => {
      // Add a task from a different project
      await page.evaluate(() => {
        return (window as any).dmSync.putTodo({
          id: 'other-proj-task',
          userId: 'test-user',
          title: 'Other Project Task',
          projectId: 'other-project-999',
          order: 1.5,
          done: false,
          status: 'active',
          bujoType: 'task',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });

      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      // Verify no items from the other project appear
      const allText = await page.locator('#focus-upnext-list').textContent();
      expect(allText).not.toContain('Other Project Task');

      // Clean up
      await page.evaluate(() => (window as any).dmSync.deleteTodo('other-proj-task'));
    });

    test('ignores deleted tasks', async ({ page }) => {
      // Mark task 2 as deleted
      await page.evaluate(() => {
        return (window as any).dmSync.getTodo('proj-task-2').then((t: any) => {
          t.deletedAt = Date.now();
          t.status = 'deleted';
          return (window as any).dmSync.putTodo(t);
        });
      });

      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      // getAllTodos() filters out deletedAt, so task 2 won't appear
      const allText = await page.locator('#focus-upnext-list').textContent();
      expect(allText).not.toContain('Project Task Beta');
      // First item should be Gamma
      await expect(
        page.locator('#focus-upnext-list .pomodoro-focus-upnext-item').first()
      ).toContainText('Project Task Gamma');

      // Restore task 2 for cleanup (deleteTodo would fully remove it)
      await page.evaluate(() => {
        return (window as any).dmSync
          .getTodoIncludingTrashed('proj-task-2')
          .then((t: any) => {
            if (t) {
              delete t.deletedAt;
              t.status = 'active';
              return (window as any).dmSync.putTodo(t);
            }
          });
      });
    });

    test('ignores non-task bujoTypes (events, notes)', async ({ page }) => {
      // Change task 2 to an event
      await page.evaluate(() => {
        return (window as any).dmSync.getTodo('proj-task-2').then((t: any) => {
          t.bujoType = 'event';
          return (window as any).dmSync.putTodo(t);
        });
      });

      await startProjectTask(page, 'proj-task-1', 'Project Task Alpha');

      await expect(page.locator('#focus-panel-upnext')).toBeVisible({ timeout: 5000 });

      // Task 2 (event) should not appear; first should be Gamma
      await expect(
        page.locator('#focus-upnext-list .pomodoro-focus-upnext-item').first()
      ).toContainText('Project Task Gamma');

      // Restore
      await page.evaluate(() => {
        return (window as any).dmSync.getTodo('proj-task-2').then((t: any) => {
          t.bujoType = 'task';
          return (window as any).dmSync.putTodo(t);
        });
      });
    });
  });
});
