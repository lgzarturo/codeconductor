import {
  detectNode,
  detectBun,
  detectSpring,
  detectDjango,
  detectPhp,
  detectAstro,
  detectNext,
  detectFastApi,
  detectMonorepo,
  detectGenericBackend,
  detectGenericFrontend,
} from './detectors';

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

