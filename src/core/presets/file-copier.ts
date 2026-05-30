import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type {
  InstallManifest,
  InstallStrategy,
  ManifestEntry,
  ModelConfig,
} from '../../validation/schemas';
import { mergeManagedBlock } from '../filesystem/safe-merger';

export type FileAction = 'written' | 'appended' | 'merged' | 'skipped' | 'error';

export interface FileCopyResult {
  src: string;
  dest: string;
  action: FileAction;
  dryRun?: boolean;
  error?: string;
}

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full, base)));
    } else {
      files.push(relative(base, full));
    }
  }
  return files;
}

async function resolveEntryFiles(
  entry: ManifestEntry,
  presetsDir: string,
  baseDir: string
): Promise<Array<{ src: string; dest: string }>> {
  const srcAbsolute = resolve(presetsDir, entry.src);
  try {
    const s = await stat(srcAbsolute);
    if (s.isDirectory()) {
      const files = await listFilesRecursive(srcAbsolute);
      return files.map((f) => ({
        src: join(srcAbsolute, f),
        dest: resolve(baseDir, entry.dest, f),
      }));
    }
    return [{ src: srcAbsolute, dest: resolve(baseDir, entry.dest) }];
  } catch {
    return [];
  }
}

function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (Array.isArray(srcVal) && Array.isArray(tgtVal)) {
      result[key] = [...new Set([...(tgtVal as unknown[]), ...(srcVal as unknown[])])];
    } else if (
      srcVal &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = mergeDeep(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

/**
 * Extract the agent role from a file path (e.g., "architect.md" -> "architect")
 */
function extractAgentRole(filePath: string): string | null {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const basename = parts[parts.length - 1];
  const name = basename.replace(/\.md$/, '');
  // Only match known agent roles
  const knownRoles = [
    'architect',
    'implementer',
    'tester',
    'orchestrator',
    'reviewer',
    'docs',
    'task-coach',
    'repo-explorer',
  ];
  return knownRoles.includes(name) ? name : null;
}

/**
 * Render template placeholders in content using model config
 *
 * For individual agent files (e.g., architect.md), extracts the role from filename.
 * For monolithic files (e.g., codex/AGENTS.md), parses sections by ### headings.
 *
 * IMPORTANT: The monolithic parser assumes agent sections are delimited by ### <role>
 * headings and terminated by the next ### or ## heading or end of file. Nested ### headings
 * within an agent section (e.g., "### Routing Decision" inside "### orchestrator") must
 * appear AFTER the --- separator and before the next agent section to parse correctly.
 */
function renderTemplate(content: string, modelConfig: ModelConfig, filePath: string): string {
  const agentRole = extractAgentRole(filePath);

  // Handle single agent file (e.g., architect.md)
  if (agentRole && modelConfig.agents[agentRole]) {
    const agentModels = modelConfig.agents[agentRole];
    const targetModel =
      agentModels[modelConfig.target as 'claude' | 'opencode' | 'codex' | 'gemini' | 'cursor' | 'agy'];
    let result = content
      .replace(/\{\{MODEL\}\}/g, targetModel ?? '')
      .replace(/\{\{MODEL_CLAUDE\}\}/g, agentModels.claude ?? '')
      .replace(/\{\{MODEL_OPENCODE\}\}/g, agentModels.opencode ?? '')
      .replace(/\{\{MODEL_CODEX\}\}/g, agentModels.codex ?? '')
      .replace(/\{\{MODEL_GEMINI\}\}/g, agentModels.gemini ?? '')
      .replace(/\{\{MODEL_CURSOR\}\}/g, agentModels.cursor ?? '');

    // Render tool/permission frontmatter for targets that define it.
    if (modelConfig.tools || modelConfig.permissions) {
      result = substituteToolNames(result, modelConfig);
    }

    return result;
  }

  // Handle monolithic files like codex AGENTS.md (contains all agent roles)
  // Split by agent sections and replace placeholders in each section
  const knownRoles = [
    'orchestrator',
    'task-coach',
    'architect',
    'implementer',
    'tester',
    'reviewer',
    'docs',
    'repo-explorer',
  ];
  let result = content;

  for (const role of knownRoles) {
    if (!modelConfig.agents[role]) continue;

    const agentModels = modelConfig.agents[role];

    // Find the section for this agent role
    // Look for patterns like "### orchestrator" or "### task-coach"
    const sectionRegex = new RegExp(`(### ${role}[\\s\\S]*?)(?=### |## |$)`, 'gi');
    const sectionMatch = result.match(sectionRegex);

    if (sectionMatch) {
      for (const section of sectionMatch) {
        // Replace placeholders within this section
        const renderedSection = section
          .replace(/\{\{MODEL_CLAUDE\}\}/g, agentModels.claude ?? '')
          .replace(/\{\{MODEL_OPENCODE\}\}/g, agentModels.opencode ?? '')
          .replace(/\{\{MODEL_CODEX\}\}/g, agentModels.codex ?? '')
          .replace(/\{\{MODEL_GEMINI\}\}/g, agentModels.gemini ?? '')
          .replace(/\{\{MODEL_CURSOR\}\}/g, agentModels.cursor ?? '');

        result = result.replace(section, renderedSection);
      }
    }
  }

  // Render tool/permission frontmatter for targets that define it.
  if (modelConfig.tools || modelConfig.permissions) {
    result = substituteToolNames(result, modelConfig);
  }

  return result;
}

/**
 * Substitute legacy tool names in frontmatter for targets that still use tools.
 * OpenCode now uses permission blocks, so deprecated tools lines are removed.
 */
function substituteToolNames(content: string, modelConfig: ModelConfig): string {
  if (!modelConfig.tools && !modelConfig.permissions) return content;

  const target = modelConfig.target as 'claude' | 'opencode' | 'codex' | 'gemini' | 'cursor' | 'agy';

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return content;

  const frontmatter = fmMatch[1];
  if (target === 'opencode' && modelConfig.permissions) {
    const updatedFrontmatter = frontmatter.replace(/^tools:\s*(.+)\n?/m, '');
    return content.replace(fmMatch[0], `---\n${updatedFrontmatter}\n---`);
  }

  if (!modelConfig.tools) return content;

  const updatedFrontmatter = frontmatter.replace(
    /^tools:\s*(.+)$/m,
    (_match, toolsLine: string) => {
      const baseNames = toolsLine.split(',').map((t: string) => t.trim());
      const mappedNames = baseNames.map((baseName: string) => {
        const toolMapping = modelConfig.tools?.[baseName];
        if (toolMapping && toolMapping[target]) {
          return toolMapping[target];
        }
        return baseName;
      });
      return `tools: ${mappedNames.join(', ')}`;
    }
  );

  return content.replace(fmMatch[0], `---\n${updatedFrontmatter}\n---`);
}

async function applySingleFile(
  srcPath: string,
  destPath: string,
  strategy: InstallStrategy,
  force: boolean,
  dryRun: boolean,
  isTemplate: boolean,
  modelConfig: ModelConfig | null
): Promise<FileCopyResult> {
  if (strategy === 'skip') {
    return { src: srcPath, dest: destPath, action: 'skipped', dryRun };
  }

  let content: string;
  try {
    content = await readFile(srcPath, 'utf-8');
  } catch (e) {
    return { src: srcPath, dest: destPath, action: 'error', error: `Cannot read source: ${e}` };
  }

  const incomingContent =
    isTemplate && modelConfig ? renderTemplate(content, modelConfig, srcPath) : content;
  let finalContent = incomingContent;
  let action: FileAction = 'written';

  if (strategy === 'append') {
    let existing = '';
    try {
      existing = await readFile(destPath, 'utf-8');
    } catch {
      /* no existing */
    }
    if (existing) {
      finalContent = existing + '\n\n---\n\n' + incomingContent;
    }
    action = 'appended';
  } else if (strategy === 'merge-json') {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await readFile(destPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      /* no existing or invalid JSON */
    }
    try {
      const incoming = JSON.parse(incomingContent) as Record<string, unknown>;
      finalContent = JSON.stringify(mergeDeep(existing, incoming), null, 2);
    } catch (e) {
      return { src: srcPath, dest: destPath, action: 'error', error: `JSON merge failed: ${e}` };
    }
    action = 'merged';
  } else if (strategy === 'merge-managed') {
    let existing: string | null = null;
    try {
      existing = await readFile(destPath, 'utf-8');
    } catch {
      /* no existing */
    }
    try {
      const merged = mergeManagedBlock(existing, incomingContent);
      finalContent = merged.content;
      action = merged.action;
    } catch (e) {
      return { src: srcPath, dest: destPath, action: 'error', error: `Managed merge failed: ${e}` };
    }
  }

  if (dryRun) {
    return { src: srcPath, dest: destPath, action, dryRun: true };
  }

  try {
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, finalContent, 'utf-8');
    return { src: srcPath, dest: destPath, action };
  } catch (e) {
    return { src: srcPath, dest: destPath, action: 'error', error: String(e) };
  }
}

export async function copyFromManifest(
  manifest: InstallManifest,
  presetsDir: string,
  baseDir: string,
  isGlobal: boolean,
  dryRun: boolean,
  force: boolean,
  modelConfig: ModelConfig | null = null
): Promise<FileCopyResult[]> {
  const results: FileCopyResult[] = [];

  for (const entry of manifest.entries) {
    const strategy: InstallStrategy =
      isGlobal && entry.globalStrategy ? entry.globalStrategy : entry.strategy;
    const files = await resolveEntryFiles(entry, presetsDir, baseDir);
    const isTemplate = entry.template === true;

    for (const { src, dest } of files) {
      results.push(
        await applySingleFile(src, dest, strategy, force, dryRun, isTemplate, modelConfig)
      );
    }
  }

  return results;
}
