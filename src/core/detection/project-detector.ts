/**
 * Project profile interface
 */
export type DetectionConfidence = 'low' | 'medium' | 'high';

export interface ProjectProfile {
  readonly rootDir: string;
  readonly languages: readonly string[];
  readonly runtimes: readonly string[];
  readonly packageManagers: readonly string[];
  readonly frameworks: readonly string[];
  readonly signals: readonly string[];
  readonly confidence: DetectionConfidence;
}

/**
 * Detect project stack
 */
export async function detectProject(rootDir: string): Promise<ProjectProfile> {
  const signals: string[] = [];
  const languages: string[] = [];
  const runtimes: string[] = [];
  const packageManagers: string[] = [];
  const frameworks: string[] = [];

  // Check for Node.js
  const nodeSignals = await detectNode(rootDir);
  if (nodeSignals.length > 0) {
    signals.push(...nodeSignals);
    languages.push('javascript', 'typescript');
    runtimes.push('node');
    packageManagers.push('npm');
  }

  // Check for Bun
  const bunSignals = await detectBun(rootDir);
  if (bunSignals.length > 0) {
    signals.push(...bunSignals);
    runtimes.push('bun');
    packageManagers.push('bun');
  }

  // Check for Spring
  const springSignals = await detectSpring(rootDir);
  if (springSignals.length > 0) {
    signals.push(...springSignals);
    languages.push('java', 'kotlin');
    runtimes.push('jvm');
    frameworks.push('spring');
  }

  // Check for Django
  const djangoSignals = await detectDjango(rootDir);
  if (djangoSignals.length > 0) {
    signals.push(...djangoSignals);
    languages.push('python');
    runtimes.push('python');
    frameworks.push('django');
  }

  // Check for PHP
  const phpSignals = await detectPhp(rootDir);
  if (phpSignals.length > 0) {
    signals.push(...phpSignals);
    languages.push('php');
    runtimes.push('php');
    packageManagers.push('composer');
  }

  // Check for Astro
  const astroSignals = await detectAstro(rootDir);
  if (astroSignals.length > 0) {
    signals.push(...astroSignals);
    frameworks.push('astro');
  }

  // Check for Next.js
  const nextSignals = await detectNext(rootDir);
  if (nextSignals.length > 0) {
    signals.push(...nextSignals);
    languages.push('javascript', 'typescript');
    runtimes.push('node');
    frameworks.push('nextjs');
  }

  // Check for FastAPI
  const fastapiSignals = await detectFastApi(rootDir);
  if (fastapiSignals.length > 0) {
    signals.push(...fastapiSignals);
    languages.push('python');
    runtimes.push('python');
    frameworks.push('fastapi');
  }

  // Check for Monorepo
  const monorepoSignals = await detectMonorepo(rootDir);
  if (monorepoSignals.length > 0) {
    signals.push(...monorepoSignals);
  }

  // Check for Generic Backend
  const genericBackendSignals = await detectGenericBackend(rootDir);
  if (
    genericBackendSignals.length > 0 &&
    !frameworks.includes('django') &&
    !frameworks.includes('fastapi') &&
    !frameworks.includes('spring')
  ) {
    signals.push(...genericBackendSignals);
    frameworks.push('backend');
    if (genericBackendSignals.includes('go.mod')) {
      languages.push('go');
      runtimes.push('go');
    }
    if (genericBackendSignals.includes('Cargo.toml')) {
      languages.push('rust');
      runtimes.push('rust');
    }
    if (genericBackendSignals.includes('Gemfile')) {
      languages.push('ruby');
      runtimes.push('ruby');
    }
    if (genericBackendSignals.includes('*.csproj')) {
      languages.push('csharp');
      runtimes.push('dotnet');
    }
  }

  // Check for Generic Frontend
  const genericFrontendSignals = await detectGenericFrontend(rootDir);
  if (
    genericFrontendSignals.length > 0 &&
    !frameworks.includes('astro') &&
    !frameworks.includes('nextjs')
  ) {
    signals.push(...genericFrontendSignals);
    frameworks.push('frontend');
    languages.push('javascript', 'typescript');
    runtimes.push('node');
  }

  const uniqueSignals = [...new Set(signals)];

  return {
    rootDir,
    languages: [...new Set(languages)],
    runtimes: [...new Set(runtimes)],
    packageManagers: [...new Set(packageManagers)],
    frameworks: [...new Set(frameworks)],
    signals: uniqueSignals,
    confidence: calculateConfidence({
      signals: uniqueSignals,
      runtimes: [...new Set(runtimes)],
      frameworks: [...new Set(frameworks)],
    }),
  };
}

export function calculateConfidence(profile: {
  readonly signals: readonly string[];
  readonly runtimes: readonly string[];
  readonly frameworks: readonly string[];
}): DetectionConfidence {
  if (profile.signals.length === 0) {
    return 'low';
  }

  const hasFramework = profile.frameworks.length > 0;
  const hasRuntime = profile.runtimes.length > 0;

  if (
    (hasFramework && profile.signals.length >= 2) ||
    (hasRuntime && profile.signals.length >= 3)
  ) {
    return 'high';
  }

  if (hasFramework || profile.signals.length >= 2 || hasRuntime) {
    return 'medium';
  }

  return 'low';
}

// Import detectors
async function detectNode(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'package.json')) {
    signals.push('package.json');
  }
  if (await fileExists(rootDir, 'node_modules')) {
    signals.push('node_modules/');
  }

  return signals;
}

async function detectBun(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'bun.lockb')) {
    signals.push('bun.lockb');
  }

  if (await fileExists(rootDir, 'bun.lock')) {
    signals.push('bun.lock');
  }

  return signals;
}

async function detectSpring(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
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

async function detectDjango(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'manage.py')) {
    signals.push('manage.py');
  }
  if (await fileExists(rootDir, 'requirements.txt')) {
    signals.push('requirements.txt');
  }

  return signals;
}

async function detectAstro(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
  const signals: string[] = [];

  if (
    (await fileExists(rootDir, 'astro.config.mjs')) ||
    (await fileExists(rootDir, 'astro.config.ts'))
  ) {
    signals.push('astro.config');
  }

  return signals;
}

async function detectPhp(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'composer.json')) {
    signals.push('composer.json');
  }

  // Check for PHP files using readdir
  try {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(rootDir, { withFileTypes: true });
    const hasPhpFiles = entries.some((entry) => entry.isFile() && entry.name.endsWith('.php'));
    if (hasPhpFiles) {
      signals.push('*.php');
    }
  } catch {
    // readdir failed
  }

  return signals;
}

async function detectNext(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
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

async function detectFastApi(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
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

async function detectMonorepo(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
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

async function detectGenericBackend(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
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

async function detectGenericFrontend(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety');
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
