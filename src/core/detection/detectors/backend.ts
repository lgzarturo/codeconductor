export async function detectSpring(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const signals: string[] = [];

  if (
    (await fileExists(rootDir, 'build.gradle')) ||
    (await fileExists(rootDir, 'build.gradle.kts'))
  ) {
    signals.push('build.gradle');
  }
  if (await fileExists(rootDir, 'pom.xml')) {
    signals.push('pom.xml');
  }

  return signals;
}

export async function detectDjango(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'manage.py')) {
    signals.push('manage.py');
  }
  if (await fileExists(rootDir, 'requirements.txt')) {
    signals.push('requirements.txt');
  }

  return signals;
}

export async function detectFastApi(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'requirements.txt')) {
    try {
      const content = await readFile(join(rootDir, 'requirements.txt'), 'utf-8');
      if (content.includes('fastapi')) {
        signals.push('fastapi-requirements');
      }
    } catch {}
  }

  if (await fileExists(rootDir, 'pyproject.toml')) {
    try {
      const content = await readFile(join(rootDir, 'pyproject.toml'), 'utf-8');
      if (content.includes('fastapi')) {
        signals.push('fastapi-pyproject');
      }
    } catch {}
  }

  for (const filename of ['main.py', 'app.py', 'app/main.py', 'app/app.py']) {
    if (await fileExists(rootDir, filename)) {
      try {
        const content = await readFile(join(rootDir, filename), 'utf-8');
        if (content.includes('FastAPI') && content.includes('fastapi')) {
          signals.push(`${filename}-fastapi`);
        }
      } catch {}
    }
  }

  return signals;
}

export async function detectPhp(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'composer.json')) {
    signals.push('composer.json');
  }

  try {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(rootDir, { withFileTypes: true });
    const hasPhpFiles = entries.some((entry) => entry.isFile() && entry.name.endsWith('.php'));
    if (hasPhpFiles) {
      signals.push('*.php');
    }
  } catch {}

  return signals;
}

export async function detectGenericBackend(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const { readdir } = await import('node:fs/promises');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'go.mod')) {
    signals.push('go.mod');
  }

  if (await fileExists(rootDir, 'Cargo.toml')) {
    signals.push('Cargo.toml');
  }

  if (await fileExists(rootDir, 'Gemfile')) {
    signals.push('Gemfile');
  }

  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const hasCsProj = entries.some((entry) => entry.isFile() && entry.name.endsWith('.csproj'));
    if (hasCsProj) {
      signals.push('*.csproj');
    }
  } catch {}

  return signals;
}
