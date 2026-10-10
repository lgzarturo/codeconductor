import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { spawnCli } from './helpers/invoke-cli';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'cc-orchestrate-concurrency-'));
  dirs.push(dir);
  await mkdir(join(dir, '.codeconductor/queue'), { recursive: true });
  await writeFile(join(dir, '.codeconductor/current-goal.yml'), stringify({
    objective: 'Deliver independent tasks safely',
    created_at: '2026-10-09T00:00:00.000Z',
    tasks: [{
      id: 'first', title: 'First task', type: 'docs', risk: 'low',
      status: 'pending', depends_on: [], acceptance_criteria: ['Delivered'],
    }],
  }));
  return dir;
}

test('orchestrate next respects a live process lock even when its timestamp is old', async () => {
  const dir = await project();
  await writeFile(join(dir, '.codeconductor/queue/.lock'), JSON.stringify({
    pid: process.pid, hostname: hostname(), timestamp: '2000-01-01T00:00:00.000Z', token: 'live-owner',
  }));
  const result = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout).errors.join(' ')).toMatch(/lock/i);
  const status = await spawnCli(['orchestrate', 'status', '--output=json'], dir);
  expect(JSON.parse(status.stdout).tasks[0].status).toBe('pending');
});

test('orchestrate run recovers a stale lock only when its same-host process is dead', async () => {
  const dir = await project();
  await writeFile(join(dir, '.codeconductor/queue/.lock'), JSON.stringify({
    pid: 2147483647, hostname: hostname(), timestamp: '2000-01-01T00:00:00.000Z', token: 'orphan-owner',
  }));
  const result = await spawnCli(['orchestrate', 'run', '--output=json'], dir);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).task.id).toBe('first');
  const events = (await readFile(join(dir, '.codeconductor/events.jsonl'), 'utf8'))
    .trim().split('\n').map((line) => JSON.parse(line));
  expect(events.filter((event) => event.type === 'lock.recovered')).toHaveLength(1);
});

test('orchestrate preserves foreign-host and recently orphaned locks', async () => {
  for (const owner of [
    { pid: 2147483647, hostname: 'another-host', timestamp: '2000-01-01T00:00:00.000Z', token: 'foreign' },
    { pid: 2147483647, hostname: hostname(), timestamp: new Date().toISOString(), token: 'recent' },
  ]) {
    const dir = await project();
    const path = join(dir, '.codeconductor/queue/.lock');
    await writeFile(path, JSON.stringify(owner));
    const result = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).errors.join(' ')).toMatch(/lock/i);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(owner);
  }
});

test('orchestrate resumes after its same-host lock recovery process dies', async () => {
  const dir = await project();
  for (const file of ['.lock', '.lock.recovery']) {
    await writeFile(join(dir, '.codeconductor/queue', file), JSON.stringify({
      pid: 2147483647, hostname: hostname(), timestamp: '2000-01-01T00:00:00.000Z', token: file,
    }));
  }
  const result = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).task.id).toBe('first');
});

test('orchestrate waits for the live elected recovery owner of an orphan lock', async () => {
  const dir = await project();
  const orphan = { pid: 2147483647, hostname: hostname(), timestamp: '2000-01-01T00:00:00.000Z', token: 'orphan' };
  const elected = { pid: process.pid, hostname: hostname(), timestamp: '2000-01-01T00:00:00.000Z', token: 'recovering' };
  await writeFile(join(dir, '.codeconductor/queue/.lock'), JSON.stringify(orphan));
  const registry = join(dir, '.codeconductor/queue/recoveries');
  await mkdir(registry);
  const record = join(registry, `${createHash('sha256').update(orphan.token).digest('hex')}.json`);
  await writeFile(record, JSON.stringify(elected));
  const result = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(await readFile(record, 'utf8'))).toEqual(elected);
  expect(JSON.parse(await readFile(join(dir, '.codeconductor/queue/.lock'), 'utf8'))).toEqual(orphan);
});

test('concurrent orphan recovery preserves interrupted elections and claims each task once', async () => {
  const dir = await project();
  const orphan = { pid: 2147483647, hostname: hostname(), timestamp: '2000-01-01T00:00:00.000Z', token: 'old-lock' };
  const interrupted = { ...orphan, token: 'interrupted-reclaimer' };
  const registry = join(dir, '.codeconductor/queue/recoveries');
  await mkdir(registry);
  const record = join(registry, `${createHash('sha256').update(orphan.token).digest('hex')}.json`);
  await writeFile(record, JSON.stringify(interrupted));
  await writeFile(join(dir, '.codeconductor/queue/.lock'), JSON.stringify(orphan));
  await writeFile(join(dir, '.codeconductor/queue/.lock.recovery'), JSON.stringify(interrupted));
  const tasks = Array.from({ length: 8 }, (_, i) => ({
    id: `task-${i}`, title: `Task ${i}`, type: 'docs', risk: 'low',
    status: 'pending', depends_on: [], acceptance_criteria: ['Delivered'],
  }));
  await writeFile(join(dir, '.codeconductor/current-goal.yml'), stringify({
    objective: 'Resume interrupted recovery', created_at: '2026-10-09T00:00:00.000Z', tasks,
  }));
  const results = await Promise.all(tasks.map(() => spawnCli(['orchestrate', 'run', '--output=json'], dir)));
  expect(results.every((result) => result.exitCode === 0)).toBe(true);
  expect(new Set(results.map((result) => JSON.parse(result.stdout).task.id)).size).toBe(8);
  expect(JSON.parse(await readFile(record, 'utf8'))).toEqual(interrupted);
  const successorPath = join(registry, `${createHash('sha256').update(interrupted.token).digest('hex')}.json`);
  expect(JSON.parse(await readFile(successorPath, 'utf8')).token).not.toBe(interrupted.token);
  const events = (await readFile(join(dir, '.codeconductor/events.jsonl'), 'utf8'))
    .trim().split('\n').map((line) => JSON.parse(line));
  expect(events.filter((event) => event.type === 'lock.recovered')).toHaveLength(1);
  expect(events.filter((event) => event.type === 'task.started')).toHaveLength(8);
});

test('parallel orchestrate run processes claim distinct tasks without losing state', async () => {
  const dir = await project();
  const tasks = Array.from({ length: 8 }, (_, i) => ({
    id: `task-${i}`, title: `Task ${i}`, type: 'docs', risk: 'low',
    status: 'pending', depends_on: [], acceptance_criteria: ['Delivered'],
  }));
  await writeFile(join(dir, '.codeconductor/current-goal.yml'), stringify({
    objective: 'Parallel claims', created_at: '2026-10-09T00:00:00.000Z', tasks,
  }));
  const results = await Promise.all(tasks.map(() => spawnCli(['orchestrate', 'run', '--output=json'], dir)));
  expect(results.every((result) => result.exitCode === 0)).toBe(true);
  expect(new Set(results.map((result) => JSON.parse(result.stdout).task.id)).size).toBe(8);
  const status = await spawnCli(['orchestrate', 'status', '--output=json'], dir);
  expect(JSON.parse(status.stdout).tasks.filter((task: { status: string }) => task.status === 'in-progress')).toHaveLength(8);
  const events = (await readFile(join(dir, '.codeconductor/events.jsonl'), 'utf8'))
    .trim().split('\n').map((line) => JSON.parse(line));
  expect(events.filter((event) => event.type === 'task.started')).toHaveLength(8);
});

test('orchestrate claims the highest priority ready task with stable source-order ties', async () => {
  const dir = await project();
  await writeFile(join(dir, '.codeconductor/current-goal.yml'), stringify({
    objective: 'Prioritized work', created_at: '2026-10-09T00:00:00.000Z',
    tasks: [
      { id: 'legacy' }, { id: 'urgent-z', priority: 'P0' }, { id: 'urgent-a', priority: 'P0' },
      { id: 'dependent', priority: 'P0', depends_on: ['legacy'] },
    ].map((task) => ({ title: task.id, type: 'docs', risk: 'low', status: 'pending', acceptance_criteria: ['Delivered'], ...task })),
  }));
  const claims: string[] = [];
  for (let i = 0; i < 3; i++) {
    const result = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
    expect(result.exitCode).toBe(0);
    claims.push(JSON.parse(result.stdout).task.id);
  }
  expect(claims).toEqual(['urgent-z', 'urgent-a', 'legacy']);
  const blocked = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
  expect(blocked.exitCode).toBe(1);
});

test('orchestrate propagates blocked dependencies transitively while preserving done tasks', async () => {
  const dir = await project();
  await writeFile(join(dir, '.codeconductor/current-goal.yml'), stringify({
    objective: 'Blocked chain', created_at: '2026-10-09T00:00:00.000Z',
    tasks: [
      { id: 'root', status: 'blocked', blocked_reason: 'Needs credentials' },
      { id: 'child', depends_on: ['root'] }, { id: 'grandchild', depends_on: ['child'] },
      { id: 'finished', status: 'done', depends_on: ['root'] }, { id: 'independent' },
    ].map((task) => ({ title: task.id, type: 'docs', risk: 'low', status: 'pending', acceptance_criteria: ['Delivered'], ...task })),
  }));
  const next = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
  expect(next.exitCode).toBe(0);
  expect(JSON.parse(next.stdout).task.id).toBe('independent');
  const status = await spawnCli(['orchestrate', 'status', '--output=json'], dir);
  const tasks = JSON.parse(status.stdout).tasks;
  expect(tasks.map((task: { status: string }) => task.status)).toEqual(['blocked', 'blocked', 'blocked', 'done', 'in-progress']);
  expect(tasks[1].blocked_reason).toContain('root');
  expect(tasks[2].blocked_reason).toContain('child');
});

test('orchestrate rejects dependency cycles with the complete cycle path', async () => {
  const dir = await project();
  await writeFile(join(dir, '.codeconductor/current-goal.yml'), stringify({
    objective: 'Invalid cycle', created_at: '2026-10-09T00:00:00.000Z',
    tasks: ['a', 'b', 'c'].map((id, i) => ({
      id, title: id, type: 'docs', risk: 'low', status: 'pending', acceptance_criteria: ['Delivered'],
      depends_on: [['b'], ['c'], ['a']][i],
    })),
  }));
  const result = await spawnCli(['orchestrate', 'next', '--output=json'], dir);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout).errors.join(' ')).toContain('a -> b -> c -> a');
});
