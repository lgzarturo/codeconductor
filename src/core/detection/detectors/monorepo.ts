export async function detectMonorepo(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'pnpm-workspace.yaml')) {
    signals.push('pnpm-workspace.yaml');
  }

  if (await fileExists(rootDir, 'lerna.json')) {
    signals.push('lerna.json');
  }

  if (await fileExists(rootDir, 'go.work')) {
    signals.push('go.work');
  }

  if (await fileExists(rootDir, 'package.json')) {
    try {
      const content = await readFile(join(rootDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.workspaces) {
        signals.push('package.json-workspaces');
      }
    } catch {}
  }

  if (await fileExists(rootDir, 'Cargo.toml')) {
    try {
      const content = await readFile(join(rootDir, 'Cargo.toml'), 'utf-8');
      if (content.includes('[workspace]')) {
        signals.push('Cargo.toml-workspace');
      }
    } catch {}
  }

  return signals;
}
