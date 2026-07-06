// Another file with deferred items

export function parseConfig(raw: string) {
  // defer - handle nested config objects
  const lines = raw.split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const [key, value] = line.split('=');
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  }
  return result;
}

// This line has no defer comment
const x = 1;
