#!/usr/bin/env bun
// One-time (but idempotent) migration script: extract version fields from
// SKILL.md frontmatter and populate skills-registry.json.
//
// This is harness-spec.md §5 ("Versioning — planned, not yet implemented"):
// move ONLY the `version` field out of every SKILL.md's frontmatter into the
// repo-root skills-registry.json, the single source of skill VERSION truth.
//
// Algorithm:
// 1. Enumerate presets/*/skills/*/SKILL.md and skills/*/SKILL.md
// 2. Read raw text preserving exact bytes and line endings
// 3. Locate frontmatter fence using /^---\r?\n([\s\S]*?)\r?\n---/
// 4. If no fence or no version line, skip file untouched
// 5. Extract id value (should always coexist with version)
// 6. Record id→version into map, processing files in priority order
// 7. Strip version line from file text using exact byte offsets
// 8. Write file back with original encoding/line-ending style
// 9. After all files: write skills-registry.json at package root
// 10. Idempotent: re-running finds zero version lines and produces no changes
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(import.meta.dir, '..');

// Frontmatter fence regex — matches /^---\r?\n([\s\S]*?)\r?\n---/
const FRONTMATTER_FENCE_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

// Version line regex within frontmatter — matches /^version:\s*(.+)$/m
const VERSION_LINE_REGEX = /^version:\s*(.+)$/m;

// ID line regex within frontmatter — matches /^id:\s*(.+)$/m
const ID_LINE_REGEX = /^id:\s*(.+)$/m;

interface SkillVersionEntry {
  version: string;
}

interface MigrationWarning {
  filePath: string;
  message: string;
}

interface MigrationResult {
  readonly processedFiles: number;
  readonly modifiedFiles: number;
  readonly skillsRecorded: number;
  readonly warnings: readonly MigrationWarning[];
  readonly conflicts: Array<{ id: string; filePath: string; version: string }>;
}

function enumerateSkillFiles(): readonly string[] {
  const files: string[] = [];
  const priorityOrder = ['opencode', 'agy', 'claude', 'codex', 'gemini', 'cursor'];

  // Helper to get sort key for priority-based ordering
  function getPriorityIndex(target: string): number {
    const idx = priorityOrder.indexOf(target);
    return idx >= 0 ? idx : priorityOrder.length;
  }

  // Process all presets/<target>/skills directories, in priority order
  const presetsDir = join(ROOT, 'presets');
  let allTargets: string[] = [];
  if (existsSync(presetsDir)) {
    try {
      allTargets = readdirSync(presetsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => getPriorityIndex(a) - getPriorityIndex(b));
    } catch (e) {
      console.warn(`Failed to enumerate presets directory:`, e);
    }
  }

  for (const target of allTargets) {
    const skillsDir = join(ROOT, 'presets', target, 'skills');
    if (!existsSync(skillsDir)) continue;
    try {
      const skillIds = readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      for (const skillId of skillIds) {
        const skillFile = join(skillsDir, skillId, 'SKILL.md');
        if (existsSync(skillFile)) {
          files.push(skillFile);
        }
      }
    } catch (e) {
      console.warn(`Failed to enumerate ${skillsDir}:`, e);
    }
  }

  // Process shared skills/ directory last
  const sharedSkillsDir = join(ROOT, 'skills');
  if (existsSync(sharedSkillsDir)) {
    try {
      const skillIds = readdirSync(sharedSkillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      for (const skillId of skillIds) {
        const skillFile = join(sharedSkillsDir, skillId, 'SKILL.md');
        if (existsSync(skillFile)) {
          files.push(skillFile);
        }
      }
    } catch (e) {
      console.warn(`Failed to enumerate ${sharedSkillsDir}:`, e);
    }
  }

  return files;
}

function extractVersionAndId(
  frontmatterContent: string
): { version?: string; id?: string } {
  const versionMatch = frontmatterContent.match(VERSION_LINE_REGEX);
  const idMatch = frontmatterContent.match(ID_LINE_REGEX);

  return {
    version: versionMatch ? versionMatch[1].trim() : undefined,
    id: idMatch ? idMatch[1].trim() : undefined,
  };
}

function stripVersionLine(rawContent: string): string {
  const fenceMatch = rawContent.match(FRONTMATTER_FENCE_REGEX);
  if (!fenceMatch) {
    return rawContent;
  }

  const fenceStartIndex = fenceMatch.index ?? 0;
  const fenceEndIndex = fenceStartIndex + fenceMatch[0].length;
  const frontmatterContent = fenceMatch[1];

  // Find the version line and its exact byte offsets within the frontmatter
  const versionLineMatch = frontmatterContent.match(/^version:.*$/m);
  if (!versionLineMatch) {
    return rawContent;
  }

  const versionLineStartInFence = versionLineMatch.index ?? 0;
  const versionLineLength = versionLineMatch[0].length;

  // Determine the line terminator (could be \r\n or \n)
  const afterVersionLine = versionLineStartInFence + versionLineLength;
  let lineTerminator = '';
  if (afterVersionLine < frontmatterContent.length) {
    if (frontmatterContent[afterVersionLine] === '\r' && frontmatterContent[afterVersionLine + 1] === '\n') {
      lineTerminator = '\r\n';
    } else if (frontmatterContent[afterVersionLine] === '\n') {
      lineTerminator = '\n';
    }
  }

  // Compute absolute byte offsets in the original raw content
  // Account for the "---\n" or "---\r\n" before the frontmatter
  const prefixMatch = rawContent.slice(0, fenceStartIndex + 4).match(/---(\r?\n)/);
  const prefixLength = prefixMatch ? prefixMatch[0].length : 4; // "---\n" or "---\r\n"
  const versionLineStartInRaw = fenceStartIndex + prefixLength + versionLineStartInFence;
  const versionLineEndInRaw = versionLineStartInRaw + versionLineLength + lineTerminator.length;

  // Strip the version line (and its terminator) from the raw content
  return rawContent.slice(0, versionLineStartInRaw) + rawContent.slice(versionLineEndInRaw);
}

function migrate(): MigrationResult {
  const skillFiles = enumerateSkillFiles();
  const registry: Record<string, SkillVersionEntry> = {};
  const warnings: MigrationWarning[] = [];
  const conflicts: Array<{ id: string; filePath: string; version: string }> = [];
  let processedFiles = 0;
  let modifiedFiles = 0;

  for (const filePath of skillFiles) {
    processedFiles++;

    let rawContent: string;
    try {
      rawContent = readFileSync(filePath, 'utf-8');
    } catch (e) {
      warnings.push({
        filePath,
        message: `Failed to read file: ${e}`,
      });
      continue;
    }

    const fenceMatch = rawContent.match(FRONTMATTER_FENCE_REGEX);
    if (!fenceMatch) {
      // No frontmatter fence, skip
      continue;
    }

    const frontmatterContent = fenceMatch[1];
    const { version, id } = extractVersionAndId(frontmatterContent);

    if (!version) {
      // No version line, skip file
      continue;
    }

    // Determine skill identifier (id or fallback to directory basename)
    let skillId = id;
    if (!skillId) {
      skillId = dirname(filePath).split(/[\\/]/).pop() ?? 'unknown';
      warnings.push({
        filePath,
        message: `No id field found; using directory name: ${skillId}`,
      });
    }

    // Record into registry (first-seen wins)
    if (registry[skillId] && registry[skillId].version !== version) {
      conflicts.push({ id: skillId, filePath, version });
      console.warn(
        `Version conflict for skill "${skillId}": first version is ${registry[skillId].version}, later file ${filePath} has ${version} — keeping first-seen`
      );
      continue;
    }

    if (!registry[skillId]) {
      registry[skillId] = { version };
    }

    // Strip version line from this file
    const strippedContent = stripVersionLine(rawContent);
    if (strippedContent === rawContent) {
      // No change (e.g., version line not found during strip) — skip write
      continue;
    }

    // Write back with original encoding/line-ending style
    try {
      writeFileSync(filePath, strippedContent, 'utf-8');
      modifiedFiles++;
    } catch (e) {
      warnings.push({
        filePath,
        message: `Failed to write file: ${e}`,
      });
    }
  }

  // Write skills-registry.json only if there are actual changes
  if (Object.keys(registry).length > 0) {
    const skillsRegistryPath = join(ROOT, 'skills-registry.json');
    const registryObject = {
      version: 1,
      skills: Object.fromEntries(
        Object.entries(registry).sort(([a], [b]) => a.localeCompare(b))
      ),
    };

    try {
      writeFileSync(skillsRegistryPath, JSON.stringify(registryObject, null, 2) + '\n', 'utf-8');
      console.log(`\nWrote ${Object.keys(registryObject.skills).length} skills to ${skillsRegistryPath}`);
    } catch (e) {
      warnings.push({
        filePath: skillsRegistryPath,
        message: `Failed to write registry: ${e}`,
      });
    }
  }

  return {
    processedFiles,
    modifiedFiles,
    skillsRecorded: Object.keys(registry).length,
    warnings,
    conflicts,
  };
}

if (import.meta.main) {
  const result = migrate();

  console.log('\n=== Migration Summary ===');
  console.log(`Files processed: ${result.processedFiles}`);
  console.log(`Files modified: ${result.modifiedFiles}`);
  console.log(`Skills recorded in registry: ${result.skillsRecorded}`);

  if (result.warnings.length > 0) {
    console.log(`\nWarnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.warn(`  ${w.filePath}: ${w.message}`);
    }
  }

  if (result.conflicts.length > 0) {
    console.log(`\nConflicts (${result.conflicts.length}) — first-seen version kept:`);
    for (const c of result.conflicts) {
      console.warn(`  ${c.id}: ${c.filePath} has version ${c.version}`);
    }
  }

  if (result.modifiedFiles === 0 && result.warnings.length === 0) {
    console.log('\nNothing to migrate — all version: lines already removed.');
  }
}
