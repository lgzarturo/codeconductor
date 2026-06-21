export async function detectAndroid(rootDir: string): Promise<string[]> {
  const { fileExists } = await import('../../filesystem/safety');
  const signals: string[] = [];

  if (
    (await fileExists(rootDir, 'AndroidManifest.xml')) ||
    (await fileExists(rootDir, 'app/src/main/AndroidManifest.xml'))
  ) {
    signals.push('AndroidManifest.xml');
  }

  if (
    (await fileExists(rootDir, 'settings.gradle')) ||
    (await fileExists(rootDir, 'settings.gradle.kts'))
  ) {
    signals.push('settings.gradle');
  }

  if (await fileExists(rootDir, 'gradlew')) {
    signals.push('gradlew');
  }

  return signals;
}
