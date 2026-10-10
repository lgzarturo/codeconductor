import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncChangeSpecs } from '../src/core/openspec/spec-sync';

const roots: string[] = [];

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cc-spec-sync-'));
  roots.push(root);
  return root;
}

async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), content, 'utf-8');
}

const existing = `# Authentication

## Requirements

### Requirement: FR-001 Existing login

The system MUST allow a user to sign in.

#### Scenario: SC-001 Valid credentials

- GIVEN a registered user
- WHEN valid credentials are submitted
- THEN the session starts

### Requirement: FR-003 Legacy login hint

The system MUST display a legacy login hint.
`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('syncChangeSpecs', () => {
  test('rejects unnamed requirements before writing any durable capability', async () => {
    const root = await project();
    await write(root, 'openspec/changes/login/specs/a-valid/spec.md', '## ADDED Requirements\n### Requirement: Login\nThe system SHALL sign in.\n');
    await write(root, 'openspec/changes/login/specs/z-invalid/spec.md', '## ADDED Requirements\n### Requirement: \nThe system SHALL respond.\n');
    expect((await syncChangeSpecs(root, 'openspec/changes/login')).success).toBe(false);
    await expect(readFile(join(root, 'openspec/specs/a-valid/spec.md'), 'utf-8')).rejects.toThrow();
  });

  test('renames before modifying the new name and validates every capability before writing', async () => {
    const root = await project();
    const durable = '# Auth\n\n### Requirement: User login\nThe system SHALL authenticate users.\n';
    await write(root, 'openspec/specs/auth/spec.md', durable);
    const delta = '## MODIFIED Requirements\n### Requirement: Member login\nThe system SHALL use passkeys.\n#### Scenario: Passkey\n- WHEN a passkey is submitted\n- THEN a session starts\n\n## RENAMED Requirements\n- FROM: `### Requirement: User login`\n- TO: `### Requirement: Member login`\n';
    await write(root, 'openspec/changes/login/specs/auth/spec.md', delta);
    await write(root, 'openspec/changes/login/specs/z-invalid/spec.md', '## RENAMED Requirements\n- FROM: `### Requirement: Missing`\n- TO: `### Requirement: Missing renamed`\n');
    expect((await syncChangeSpecs(root, 'openspec/changes/login')).success).toBe(false);
    expect(await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8')).toBe(durable);
    await rm(join(root, 'openspec/changes/login/specs/z-invalid'), { recursive: true });
    expect((await syncChangeSpecs(root, 'openspec/changes/login')).success).toBe(true);
    const synced = await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8');
    expect(synced).toContain('### Requirement: Member login');
    expect(synced).toContain('The system SHALL use passkeys.');
    expect(synced).not.toContain('User login');
  });

  test('modifies and removes official requirements using stable capability IDs', async () => {
    const root = await project();
    await write(root, 'openspec/specs/auth/spec.md', '# Auth\n\n### Requirement: User login\nThe system SHALL authenticate users.\n\n### Requirement: Password hints\nThe system SHALL display hints.\n');
    await write(root, 'openspec/changes/login/specs/auth/spec.md', '## MODIFIED Requirements\n### Requirement: User login\nThe system SHALL authenticate using passkeys.\n#### Scenario: Passkey\n- WHEN a passkey is submitted\n- THEN a session starts\n\n## REMOVED Requirements\n### Requirement: Password hints\n**Reason**: Replaced.\n');
    expect((await syncChangeSpecs(root, 'openspec/changes/login')).success).toBe(true);
    const synced = await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8');
    expect(synced).toContain('authenticate using passkeys');
    expect(synced).not.toContain('Password hints');
    expect(synced).not.toContain('## REMOVED Requirements');
  });

  test('rejects rename conflicts and malformed pairs without changing durable specs', async () => {
    for (const rename of [
      '- FROM: `### Requirement: Missing`\n- TO: `### Requirement: Member login`',
      '- FROM: `### Requirement: User login`\n- TO: `### Requirement: Sign out`',
      '- FROM: `### Requirement: User login`',
    ]) {
      const root = await project();
      const durable = '# Auth\n\n### Requirement: User login\nThe system SHALL authenticate.\n\n### Requirement: Sign out\nThe system SHALL sign out.\n';
      await write(root, 'openspec/specs/auth/spec.md', durable);
      await write(root, 'openspec/changes/login/specs/auth/spec.md', `## RENAMED Requirements\n${rename}\n\n## ADDED Requirements\n### Requirement: Passkey\nThe system SHALL support passkeys.\n`);
      const result = await syncChangeSpecs(root, 'openspec/changes/login');
      expect(result.success).toBe(false);
      expect(await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8')).toBe(durable);
    }
  });

  test('synchronizes official named requirements and FROM/TO renames preserving scenarios', async () => {
    const root = await project();
    await write(root, 'openspec/specs/auth/spec.md', '# Authentication\n\n### Requirement: User login\nThe system SHALL authenticate users.\n#### Scenario: Valid credentials\n- **WHEN** credentials are valid\n- **THEN** a session starts\n');
    await write(root, 'openspec/changes/login/specs/auth/spec.md', '## RENAMED Requirements\n- FROM: `### Requirement: User login`\n- TO: `### Requirement: Member login`\n\n## ADDED Requirements\n### Requirement: Sign out\nThe system SHALL end the session.\n#### Scenario: Session ends\n- **WHEN** sign out is requested\n- **THEN** the session ends\n');
    const result = await syncChangeSpecs(root, 'openspec/changes/login');
    expect(result.success).toBe(true);
    const synced = await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8');
    expect(synced).toContain('### Requirement: Member login');
    expect(synced).toContain('#### Scenario: Valid credentials');
    expect(synced).toContain('### Requirement: Sign out');
    expect(synced).not.toContain('### Requirement: User login');
    expect(synced).not.toContain('## ADDED Requirements');
  });

  test('applies ADDED, MODIFIED, and REMOVED deltas to their capability', async () => {
    const root = await project();
    await write(root, 'openspec/specs/auth/spec.md', existing);
    await write(root, 'openspec/changes/login/specs/auth/spec.md', `# Delta: Authentication

## MODIFIED Requirements

### Requirement: FR-001 Existing login

The system MUST allow a user to sign in with a password or passkey.

#### Scenario: SC-001 Valid credentials

- GIVEN a registered user
- WHEN valid credentials are submitted
- THEN the session starts

## ADDED Requirements

### Requirement: FR-002 Sign out

The system MUST allow a signed-in user to sign out.

#### Scenario: SC-002 Sign out succeeds

- GIVEN a signed-in user
- WHEN sign out is requested
- THEN the session ends

## REMOVED Requirements

### Requirement: FR-003 Legacy login hint

The legacy hint is no longer supported.
`);

    const result = await syncChangeSpecs(root, 'openspec/changes/login');

    expect(result.success).toBe(true);
    const synced = await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8');
    expect(synced).toContain('password or passkey');
    expect(synced).toContain('FR-002 Sign out');
    expect(synced).not.toContain('FR-003 Legacy login hint');
  });

  test('fails before writing when a modified requirement does not exist', async () => {
    const root = await project();
    await write(root, 'openspec/specs/auth/spec.md', existing);
    await write(root, 'openspec/changes/login/specs/auth/spec.md', `# Delta: Authentication

## MODIFIED Requirements

### Requirement: FR-999 Missing requirement

The system MUST not be invented.

#### Scenario: SC-999 Missing requirement

- GIVEN no matching requirement
- WHEN sync is attempted
- THEN it fails
`);

    const result = await syncChangeSpecs(root, 'openspec/changes/login');

    expect(result.success).toBe(false);
    expect(await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8')).toBe(existing);
  });

  test('does not apply an earlier capability when a later delta is invalid', async () => {
    const root = await project();
    await write(root, 'openspec/changes/login/specs/a-valid/spec.md', `# Delta

## ADDED Requirements

### Requirement: FR-001 New capability

The system MUST add the capability.

#### Scenario: SC-001 It works

- GIVEN the change
- WHEN it is synchronized
- THEN the capability exists
`);
    await write(root, 'openspec/changes/login/specs/z-invalid/spec.md', `# Delta

## REMOVED Requirements

### Requirement: FR-999 Missing requirement

The system MUST reject this change.

#### Scenario: SC-999 It fails

- GIVEN no durable requirement
- WHEN sync runs
- THEN no durable spec changes
`);

    const result = await syncChangeSpecs(root, 'openspec/changes/login');

    expect(result.success).toBe(false);
    await expect(readFile(join(root, 'openspec/specs/a-valid/spec.md'), 'utf-8')).rejects.toThrow();
  });

  test('fails closed when the durable capability has duplicate IDs', async () => {
    const root = await project();
    const duplicate = `${existing}\n### Requirement: FR-001 Duplicate login\n\nThe system MUST reject ambiguity.\n`;
    await write(root, 'openspec/specs/auth/spec.md', duplicate);
    await write(root, 'openspec/changes/login/specs/auth/spec.md', `# Delta

## MODIFIED Requirements

### Requirement: FR-001 Existing login

The system MUST use an unambiguous requirement.

#### Scenario: SC-001 Login

- GIVEN a user
- WHEN credentials are submitted
- THEN the session starts
`);

    const result = await syncChangeSpecs(root, 'openspec/changes/login');

    expect(result.success).toBe(false);
    expect(await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8')).toBe(duplicate);
  });

  test('writes `$` patterns in delta content literally instead of expanding them', async () => {
    const root = await project();
    await write(root, 'openspec/specs/auth/spec.md', existing);
    await write(root, 'openspec/changes/login/specs/auth/spec.md', `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: FR-001 Existing login\n\nThe system MUST show prices like $& and $1 literally.\n\n#### Scenario: SC-001 Login\n\n- GIVEN a user\n- WHEN credentials are submitted\n- THEN the session starts\n`);

    const result = await syncChangeSpecs(root, 'openspec/changes/login');

    expect(result.success).toBe(true);
    const synced = await readFile(join(root, 'openspec/specs/auth/spec.md'), 'utf-8');
    expect(synced).toContain('prices like $& and $1 literally.');
  });
});
