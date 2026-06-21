export async function detectAstro(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const signals: string[] = [];

  if (
    (await fileExists(rootDir, 'astro.config.mjs')) ||
    (await fileExists(rootDir, 'astro.config.ts'))
  ) {
    signals.push('astro.config');
  }

  return signals;
}

export async function detectNext(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const signals: string[] = [];

  if (
    (await fileExists(rootDir, 'next.config.js')) ||
    (await fileExists(rootDir, 'next.config.mjs')) ||
    (await fileExists(rootDir, 'next.config.ts'))
  ) {
    signals.push('next.config');
  }

  if (await fileExists(rootDir, 'package.json')) {
    try {
      const content = await readFile(join(rootDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.dependencies?.next || pkg.devDependencies?.next) {
        signals.push('package.json-next');
      }
    } catch {}
  }

  return signals;
}

export async function detectGenericFrontend(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'index.html')) {
    signals.push('index.html');
  }

  if (
    (await fileExists(rootDir, 'vite.config.js')) ||
    (await fileExists(rootDir, 'vite.config.ts'))
  ) {
    signals.push('vite.config');
  }

  if (await fileExists(rootDir, 'webpack.config.js')) {
    signals.push('webpack.config.js');
  }

  if (await fileExists(rootDir, 'package.json')) {
    try {
      const content = await readFile(join(rootDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      const frontendDeps = ['react', 'vue', 'svelte', 'solid-js', 'angular', '@angular/core'];
      const hasFrontendDep = frontendDeps.some(
        (dep) => pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]
      );
      if (hasFrontendDep) {
        signals.push('package.json-frontend');
      }
    } catch {}
  }

  return signals;
}
