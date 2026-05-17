/**
 * Project profile interface
 */
export interface ProjectProfile {
  readonly rootDir: string
  readonly languages: readonly string[]
  readonly runtimes: readonly string[]
  readonly packageManagers: readonly string[]
  readonly frameworks: readonly string[]
  readonly signals: readonly string[]
}

/**
 * Detect project stack
 */
export async function detectProject(rootDir: string): Promise<ProjectProfile> {
  const signals: string[] = []
  const languages: string[] = []
  const runtimes: string[] = []
  const packageManagers: string[] = []
  const frameworks: string[] = []

  // Check for Node.js
  const nodeSignals = await detectNode(rootDir)
  if (nodeSignals.length > 0) {
    signals.push(...nodeSignals)
    languages.push('javascript', 'typescript')
    runtimes.push('node')
    packageManagers.push('npm')
  }

  // Check for Bun
  const bunSignals = await detectBun(rootDir)
  if (bunSignals.length > 0) {
    signals.push(...bunSignals)
    runtimes.push('bun')
    packageManagers.push('bun')
  }

  // Check for Spring
  const springSignals = await detectSpring(rootDir)
  if (springSignals.length > 0) {
    signals.push(...springSignals)
    languages.push('java', 'kotlin')
    runtimes.push('jvm')
    frameworks.push('spring')
  }

  // Check for Django
  const djangoSignals = await detectDjango(rootDir)
  if (djangoSignals.length > 0) {
    signals.push(...djangoSignals)
    languages.push('python')
    runtimes.push('python')
    frameworks.push('django')
  }

  // Check for Astro
  const astroSignals = await detectAstro(rootDir)
  if (astroSignals.length > 0) {
    signals.push(...astroSignals)
    frameworks.push('astro')
  }

  return {
    rootDir,
    languages: [...new Set(languages)],
    runtimes: [...new Set(runtimes)],
    packageManagers: [...new Set(packageManagers)],
    frameworks: [...new Set(frameworks)],
    signals: [...new Set(signals)]
  }
}

// Import detectors
async function detectNode(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety')
  const signals: string[] = []

  if (await fileExists(rootDir, 'package.json')) {
    signals.push('package.json')
  }
  if (await fileExists(rootDir, 'node_modules')) {
    signals.push('node_modules/')
  }

  return signals
}

async function detectBun(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety')
  const signals: string[] = []

  if (await fileExists(rootDir, 'bun.lockb')) {
    signals.push('bun.lockb')
  }

  if (await fileExists(rootDir, 'bun.lock')) {
    signals.push('bun.lock')
  }

  return signals
}

async function detectSpring(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety')
  const signals: string[] = []

  if (await fileExists(rootDir, 'build.gradle') || await fileExists(rootDir, 'build.gradle.kts')) {
    signals.push('build.gradle')
  }
  if (await fileExists(rootDir, 'pom.xml')) {
    signals.push('pom.xml')
  }

  return signals
}

async function detectDjango(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety')
  const signals: string[] = []

  if (await fileExists(rootDir, 'manage.py')) {
    signals.push('manage.py')
  }
  if (await fileExists(rootDir, 'requirements.txt')) {
    signals.push('requirements.txt')
  }

  return signals
}

async function detectAstro(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../filesystem/safety')
  const signals: string[] = []

  if (await fileExists(rootDir, 'astro.config.mjs') || await fileExists(rootDir, 'astro.config.ts')) {
    signals.push('astro.config')
  }

  return signals
}