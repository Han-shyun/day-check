import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

function createSandbox(prefix = 'day-check-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    dbPath: path.join(dir, 'test.sqlite'),
    logPath: path.join(dir, 'security-events.log'),
  };
}

function applyEnv(overrides) {
  const previous = new Map();
  Object.entries(overrides).forEach(([key, value]) => {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  });

  return () => {
    previous.forEach((value, key) => {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  };
}

async function loadServerModule(overrides) {
  const restoreEnv = applyEnv(overrides);
  vi.resetModules();
  const imported = await import('../server.js');
  const mod = imported.default || imported;
  return { mod, restoreEnv };
}

async function cleanupModule(mod, restoreEnv, sandbox) {
  try {
    await mod?.closeDatabase?.();
  } catch {
    // ignore db close errors in tests
  }
  restoreEnv?.();
  if (sandbox?.dir) {
    fs.rmSync(sandbox.dir, { recursive: true, force: true });
  }
}

describe('server core', () => {
  it('returns unauthenticated on GET /api/auth/me without cookie', async () => {
    const sandbox = createSandbox();
    const { mod, restoreEnv } = await loadServerModule({
      DATABASE_PATH: sandbox.dbPath,
      SECURITY_EVENT_LOG_PATH: sandbox.logPath,
      SESSION_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    });

    try {
      const response = await request(mod.app).get('/api/auth/me');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ authenticated: false });
    } finally {
      await cleanupModule(mod, restoreEnv, sandbox);
    }
  });

  it('normalizes legacy category/categoryId into projectLaneId', async () => {
    const sandbox = createSandbox();
    const { mod, restoreEnv } = await loadServerModule({
      DATABASE_PATH: sandbox.dbPath,
      SECURITY_EVENT_LOG_PATH: sandbox.logPath,
      SESSION_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    });

    try {
      const normalized = mod.normalizeState({
        projectLanes: [
          { id: 'lane-a', name: '업무', bucket: 'bucket2' },
        ],
        todos: [
          {
            id: 'todo-1',
            title: 'legacy todo',
            bucket: 'bucket2',
            categoryId: 'lane-a',
            createdAt: 'invalid-date',
          },
        ],
        doneLog: [
          {
            id: 'done-1',
            title: 'legacy done',
            bucket: 'bucket2',
            category: '업무',
            createdAt: '',
            completedAt: '',
          },
        ],
      });

      expect(normalized.todos[0].projectLaneId).toBe('lane-a');
      expect(normalized.doneLog[0].projectLaneId).toBe('lane-a');
      expect(normalized.todos[0]).not.toHaveProperty('categoryId');
      expect(normalized.doneLog[0]).not.toHaveProperty('category');
      expect(normalized.todos[0].createdAt).toMatch(/T/);
      expect(normalized.doneLog[0].completedAt).toMatch(/T/);
    } finally {
      await cleanupModule(mod, restoreEnv, sandbox);
    }
  });

  it('keeps db_migrations idempotent across repeated ensureDatabase runs', async () => {
    const sandbox = createSandbox();
    const { mod, restoreEnv } = await loadServerModule({
      DATABASE_PATH: sandbox.dbPath,
      SECURITY_EVENT_LOG_PATH: sandbox.logPath,
      SESSION_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    });

    try {
      await mod.ensureDatabase();
      await mod.ensureDatabase();
      const rows = await mod.all('SELECT version FROM db_migrations ORDER BY version ASC');
      expect(rows.map((row) => Number(row.version))).toEqual([1, 2, 3]);
    } finally {
      await cleanupModule(mod, restoreEnv, sandbox);
    }
  });

  it('rotates security log file when max size is exceeded', async () => {
    const sandbox = createSandbox('day-check-rotate-test-');
    const { mod, restoreEnv } = await loadServerModule({
      DATABASE_PATH: sandbox.dbPath,
      SECURITY_EVENT_LOG_PATH: sandbox.logPath,
      SECURITY_EVENT_LOG_MAX_BYTES: '20',
      SESSION_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mod.logSecurityEvent('rotation_test', { payload: 'x'.repeat(640) });
      mod.logSecurityEvent('rotation_test', { payload: 'y'.repeat(640) });

      expect(fs.existsSync(sandbox.logPath)).toBe(true);
      expect(fs.existsSync(`${sandbox.logPath}.1`)).toBe(true);
    } finally {
      warnSpy.mockRestore();
      await cleanupModule(mod, restoreEnv, sandbox);
    }
  });
});
