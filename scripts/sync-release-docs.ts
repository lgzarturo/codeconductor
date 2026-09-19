import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const RELEASE_DOCS = [
  'README.md',
  'docs/cc-commands.md',
  'docs/current-status.md',
  'docs/current-limitations.md',
  'docs/architecture.md',
] as const;

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function stableLine(version: string): string {
  const [major, minor] = version.split('.');
  return `${major}.${minor}.x`;
}

export function synchronizeReleaseDocContent(
  documentPath: string,
  content: string,
  version: string,
): string {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }

  const line = stableLine(version);

  switch (documentPath) {
    case 'README.md':
      return content
        .replace(/cc-codeconductor\/\d+\.\d+\.\d+(?=\))/g, `cc-codeconductor/${version}`)
        .replace(
          /Published package is \*\*\d+\.\d+\.\d+\*\* \(current stable(?: line)?: \*?\*?\d+\.\d+\.x?\*?\*?\)\./,
          `Published package is **${version}** (current stable line: **${line}**).`,
        )
        .replace(/Shipped in the \d+\.\d+\.x stable line:/g, `Shipped in the ${line} stable line:`)
        .replace(
          /Published \*\*\d+\.\d+\.\d+\*\* declares two production dependencies/,
          `Published **${version}** declares two production dependencies`,
        )
        .replace(/cc\["cc-codeconductor@\d+\.\d+\.\d+"\]/, `cc["cc-codeconductor@${version}"]`)
        .replace(
          /Published package: \*\*\d+\.\d+\.x \(current stable: \d+\.\d+\.\d+\)\*\*\./,
          `Published package: **${line} (current stable: ${version})**.`,
        );
    case 'docs/cc-commands.md':
      return content.replace(
        /Published package is \*\*\d+\.\d+\.\d+\*\*, the\ncurrent stable release in the \*\*\d+\.\d+\.x\*\* line\./,
        `Published package is **${version}**, the\ncurrent stable release in the **${line}** line.`,
      );
    case 'docs/current-status.md':
      return content
        .replace(
          /\*\*Published package version:\*\* `[^`]+` — current stable line: `[^`]+`/,
          `**Published package version:** \`${version}\` — current stable line: \`${line}\``,
        )
        .replace(/Available in stable \d+\.\d+\.x/g, `Available in stable ${line}`)
        .replace(
          /The package and operational documentation are synchronized at \*\*v\d+\.\d+\.\d+\*\*\./,
          `The package and operational documentation are synchronized at **v${version}**.`,
        );
    case 'docs/current-limitations.md':
      return content
        .replace(
          /`\d+\.\d+\.\d+`, the current stable release in the `\d+\.\d+\.x` line\./,
          `\`${version}\`, the current stable release in the \`${line}\` line.`,
        )
        .replace(/published\n`\d+\.\d+\.x` line/g, `published\n\`${line}\` line`);
    case 'docs/architecture.md':
      return content
        .replace(/current stable `\d+\.\d+\.x` line/g, `current stable \`${line}\` line`)
        .replace(/published `\d+\.\d+\.x`/g, `published \`${line}\``)
        .replace(/Shipped in \*\*\d+\.\d+\.x\*\*/g, `Shipped in **${line}**`);
    default:
      return content;
  }
}

export async function synchronizeReleaseDocs(root: string, version: string): Promise<string[]> {
  const changed: string[] = [];

  for (const documentPath of RELEASE_DOCS) {
    const absolutePath = join(root, documentPath);
    const current = await readFile(absolutePath, 'utf8');
    const next = synchronizeReleaseDocContent(documentPath, current, version);
    if (next !== current) {
      await writeFile(absolutePath, next, 'utf8');
      changed.push(documentPath);
    }
  }

  return changed;
}

if (import.meta.main) {
  const version = Bun.argv[2];
  if (!version) {
    console.error('Usage: bun run scripts/sync-release-docs.ts <version>');
    process.exit(1);
  }

  const changed = await synchronizeReleaseDocs(process.cwd(), version);
  for (const documentPath of changed) {
    console.log(`Synchronized ${documentPath}`);
  }
}
