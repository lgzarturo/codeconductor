export async function detectNode(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'package.json')) {
    signals.push('package.json');
  }
  if (await fileExists(rootDir, 'node_modules')) {
    signals.push('node_modules/');
  }

  return signals;
}

export async function detectBun(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const signals: string[] = [];

  if (await fileExists(rootDir, 'bun.lockb')) {
    signals.push('bun.lockb');
  }

  if (await fileExists(rootDir, 'bun.lock')) {
    signals.push('bun.lock');
  }

  return signals;
}
