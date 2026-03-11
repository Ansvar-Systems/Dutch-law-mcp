import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { prepareRuntimeDatabase } from '../../src/utils/runtime-db.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('prepareRuntimeDatabase', () => {
  it('copies the source database into the runtime directory and clears stale lock dirs', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dutch-law-runtime-test-'));
    cleanupPaths.push(tempRoot);

    const sourcePath = path.join(tempRoot, 'source.db');
    const runtimeDir = path.join(tempRoot, 'runtime');
    fs.writeFileSync(sourcePath, 'test-db', 'utf-8');
    fs.mkdirSync(path.join(runtimeDir, 'database.db.lock'), { recursive: true });

    const runtimePath = prepareRuntimeDatabase(sourcePath, { runtimeDir });

    expect(runtimePath).toBe(path.join(runtimeDir, 'database.db'));
    expect(fs.readFileSync(runtimePath, 'utf-8')).toBe('test-db');
    expect(fs.existsSync(`${runtimePath}.lock`)).toBe(false);
  });
});
