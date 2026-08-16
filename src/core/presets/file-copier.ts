import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import {
  getLanguageInstruction,
  LOCALE_PLACEHOLDER,
  COMMIT_STYLE,
  COMMIT_WORKFLOW,
  type SupportedLocale,
} from '../i18n/language-instructions';
import type {
  InstallManifest,
  InstallStrategy,
  ManifestEntry,
  ModelConfig,
} from '../../validation/schemas';
import {
  MANAGED_BEGIN_MARKER,
  MANAGED_END_MARKER,
  mergeManagedBlock,
} from '../filesystem/safe-merger';
import { detectComplementaryTools } from './complementary-detector';

export type FileAction = 'written' | 'appended' | 'merged' | 'skipped' | 'error';

export interface FileCopyResult {
  src: string;
  dest: string;
  action: FileAction;
  dryRun?: boolean;
  error?: string;
}

const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

async function writeDestinationNoFollow(destPath: string, content: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      destPath,
      constants.O_WRONLY | constants.O_CREAT | O_NOFOLLOW,
    );
    const fdStat = await handle.stat();
    const pathStat = await lstat(destPath);
    if (pathStat.isSymbolicLink()) {
      throw new Error(`Destination is a symlink: ${destPath}`);
    }
    if (
      !fdStat.isFile() ||
      pathStat.dev !== fdStat.dev ||
      pathStat.ino !== fdStat.ino
    ) {
      throw new Error(`Destination changed during write: ${destPath}`);
    }
    await handle.truncate(0);
    await handle.write(content, 0, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP' || code === 'EMLINK' || code === 'EFTYPE') {
      throw new Error(`Destination is a symlink: ${destPath}`);
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
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
  // readdir order is filesystem-dependent; sort so installs are reproducible.
  return files.sort();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveEntryFiles(
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

export function mergeDeep(
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
    'complexity-auditor',
    'security-reviewer',
    'goal-planner',
    'contract-builder',
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
export function renderTemplate(content: string, modelConfig: ModelConfig, filePath: string, locale = 'en'): string {
  const cleanLocale = (locale === 'es' || locale === 'en') ? locale : 'en';

  const tools = detectComplementaryTools();
  let complementaryRules = '';
  if (cleanLocale === 'es') {
    if (tools.rtk) {
      complementaryRules += '\n- **RTK**: Ejecuta los comandos de bash con el prefijo rtk (ej. rtk test) para comprimir la salida.';
    }
    if (tools.codeReviewGraph) {
      complementaryRules += '\n- **code-review-graph**: Usa code-review-graph para calcular el radio de impacto antes de realizar revisiones.';
    }
    if (tools.tokenSavior) {
      complementaryRules += '\n- **token-savior**: Usa las herramientas MCP de token-savior para navegación de símbolos y memoria persistente.';
    }
    if (tools.caveman) {
      complementaryRules += '\n- **caveman**: Responde usando el estilo caveman (conciso y directo) para ahorrar tokens de salida.';
    }
    if (tools.engram) {
      complementaryRules += '\n- **engram**: Guarda y busca memorias de sesión usando las herramientas MCP de engram.';
    }
    if (tools.gentleAi) {
      complementaryRules += '\n- **gentle-ai**: Sigue las guías de Gentle AI SDD para flujos de trabajo multi-fase.';
    }
    if (complementaryRules) {
      complementaryRules = '\n\n## Herramientas Complementarias\n' + complementaryRules;
    }
  } else {
    if (tools.rtk) {
      complementaryRules += '\n- **RTK**: Run bash commands prefixed with rtk (e.g. rtk test) for compressed command output.';
    }
    if (tools.codeReviewGraph) {
      complementaryRules += '\n- **code-review-graph**: Use code-review-graph to map code impact radius before editing/reviewing.';
    }
    if (tools.tokenSavior) {
      complementaryRules += '\n- **token-savior**: Use token-savior MCP tools for symbol navigation/recall instead of full file reads.';
    }
    if (tools.caveman) {
      complementaryRules += '\n- **caveman**: Adopt Caveman style (terse, direct, no fluff) in your responses.';
    }
    if (tools.engram) {
      complementaryRules += '\n- **engram**: Save/search session memories using the engram MCP tools.';
    }
    if (tools.gentleAi) {
      complementaryRules += '\n- **gentle-ai**: Follow Gentle AI SDD guidelines for multi-phase workflows.';
    }
    if (complementaryRules) {
      complementaryRules = '\n\n## Complementary Tools\n' + complementaryRules;
    }
  }

  const templatedContent = content
    .replace(/\{\{COMMIT_STYLE\}\}/g, COMMIT_STYLE[cleanLocale])
    .replace(/\{\{COMMIT_WORKFLOW\}\}/g, COMMIT_WORKFLOW[cleanLocale])
    .replace(/\{\{COMPLEMENTARY_RULES\}\}/g, complementaryRules);

  const agentRole = extractAgentRole(filePath);

  // Handle single agent file (e.g., architect.md)
  if (agentRole && modelConfig.agents[agentRole]) {
    const agentModels = modelConfig.agents[agentRole];
    const targetModel =
      agentModels[modelConfig.target as 'claude' | 'opencode' | 'codex' | 'gemini' | 'cursor' | 'agy'];
    let result = templatedContent
      .replace(/\{\{MODEL\}\}/g, targetModel ?? '')
      .replace(/\{\{MODEL_CLAUDE\}\}/g, agentModels.claude ?? '')
      .replace(/\{\{MODEL_OPENCODE\}\}/g, agentModels.opencode ?? '')
      .replace(/\{\{MODEL_CODEX\}\}/g, agentModels.codex ?? '')
      .replace(/\{\{MODEL_GEMINI\}\}/g, agentModels.gemini ?? '')
      .replace(/\{\{MODEL_CURSOR\}\}/g, agentModels.cursor ?? '')
      .replace(/\{\{MODEL_GROK\}\}/g, agentModels.grok ?? '')
      .replace(new RegExp(LOCALE_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'g'), getLanguageInstruction(locale));

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
    'goal-planner',
    'complexity-auditor',
    'security-reviewer',
    'contract-builder',
  ];
  let result = templatedContent;

  for (const role of knownRoles) {
    if (!modelConfig.agents[role]) continue;

    const agentModels = modelConfig.agents[role];

    // Find the section for this agent role
    const sectionRegex = new RegExp(`(### ${role}[\\s\\S]*?)(?=### |## |$)`, 'gi');
    const sectionMatch = result.match(sectionRegex);

    if (sectionMatch) {
      for (const section of sectionMatch) {
        const renderedSection = section
          .replace(/\{\{MODEL_CLAUDE\}\}/g, agentModels.claude ?? '')
          .replace(/\{\{MODEL_OPENCODE\}\}/g, agentModels.opencode ?? '')
          .replace(/\{\{MODEL_CODEX\}\}/g, agentModels.codex ?? '')
          .replace(/\{\{MODEL_GEMINI\}\}/g, agentModels.gemini ?? '')
          .replace(/\{\{MODEL_CURSOR\}\}/g, agentModels.cursor ?? '')
      .replace(/\{\{MODEL_GROK\}\}/g, agentModels.grok ?? '');

        result = result.replace(section, renderedSection);
      }
    }
  }

  // Replace locale placeholder for monolithic files
  result = result.replace(
    new RegExp(LOCALE_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'g'),
    getLanguageInstruction(locale)
  );

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

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return content;

  const frontmatter = fmMatch[1];
  if (target === 'opencode' && modelConfig.permissions) {
    const updatedFrontmatter = frontmatter.replace(/^tools:\s*(.+)\r?\n?/m, '');
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

function injectMcpServers(jsonString: string, filePath: string): string {
  const isAgyMcpConfig = filePath.endsWith('mcp_config.json');
  const isClaudeSettings = filePath.endsWith('settings.json');
  const isOpencodeJsonc = filePath.endsWith('opencode.jsonc') || filePath.endsWith('opencode.json');
  
  if (!isAgyMcpConfig && !isClaudeSettings && !isOpencodeJsonc) {
    return jsonString;
  }

  try {
    let cleanJson = jsonString;
    if (isOpencodeJsonc) {
      cleanJson = jsonString.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    }
    
    const obj = JSON.parse(cleanJson);
    const tools = detectComplementaryTools();
    const mcpServers: Record<string, any> = {};
    
    if (tools.tokenSavior) {
      mcpServers['token-savior-recall'] = {
        command: 'token-savior',
        env: {
          TOKEN_SAVIOR_CLIENT: isClaudeSettings ? 'claude-code' : isOpencodeJsonc ? 'opencode' : 'agy',
        }
      };
    }
    
    if (tools.codeReviewGraph) {
      mcpServers['code-review-graph'] = {
        command: 'code-review-graph',
        args: ['mcp']
      };
    }

    if (Object.keys(mcpServers).length === 0) {
      return jsonString;
    }

    if (isClaudeSettings || isAgyMcpConfig) {
      obj.mcpServers = mergeDeep(obj.mcpServers || {}, mcpServers);
    } else if (isOpencodeJsonc) {
      const opencodeMcp: Record<string, any> = {};
      for (const [key, server] of Object.entries(mcpServers)) {
        const commandArray = typeof server.command === 'string'
          ? [server.command, ...(server.args || [])]
          : server.command;

        const formattedServer: Record<string, any> = {
          type: 'local',
          command: commandArray,
          enabled: true,
        };

        if (server.env) {
          formattedServer.environment = server.env;
        }

        opencodeMcp[key] = formattedServer;
      }
      obj.mcp = mergeDeep(obj.mcp || {}, opencodeMcp);
    }

    return JSON.stringify(obj, null, 2);
  } catch {
    return jsonString;
  }
}

export async function applySingleFile(
  srcPath: string,
  destPath: string,
  strategy: InstallStrategy,
  force: boolean,
  dryRun: boolean,
  isTemplate: boolean,
  modelConfig: ModelConfig | null,
  locale: string
): Promise<FileCopyResult> {
  if (strategy === 'skip') {
    return { src: srcPath, dest: destPath, action: 'skipped', dryRun };
  }

  try {
    if ((await lstat(destPath)).isSymbolicLink()) {
      return {
        src: srcPath,
        dest: destPath,
        action: 'error',
        error: `Destination is a symlink: ${destPath}`,
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { src: srcPath, dest: destPath, action: 'error', error: String(error) };
    }
  }

  if (strategy === 'overwrite' && !force && (await fileExists(destPath))) {
    return { src: srcPath, dest: destPath, action: 'skipped', dryRun };
  }

  let content: string;
  try {
    content = await readFile(srcPath, 'utf-8');
  } catch (e) {
    return { src: srcPath, dest: destPath, action: 'error', error: `Cannot read source: ${e}` };
  }

  let incomingContent =
    isTemplate && modelConfig ? renderTemplate(content, modelConfig, srcPath, locale) : content;
  incomingContent = injectMcpServers(incomingContent, destPath);
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
    // A destination without markers is fully user-owned: mergeManagedBlock would
    // return the incoming content verbatim, so only overwrite it under --force.
    const markerless =
      existing !== null &&
      !existing.includes(MANAGED_BEGIN_MARKER) &&
      !existing.includes(MANAGED_END_MARKER);
    if (markerless && !force) {
      return { src: srcPath, dest: destPath, action: 'skipped', dryRun };
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
    await writeDestinationNoFollow(destPath, finalContent);
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
  modelConfig: ModelConfig | null = null,
  locale = 'en'
): Promise<FileCopyResult[]> {
  const results: FileCopyResult[] = [];

  for (const entry of manifest.entries) {
    const strategy: InstallStrategy =
      isGlobal && entry.globalStrategy ? entry.globalStrategy : entry.strategy;

    let resolvedBaseDir = baseDir;
    let resolvedEntry = entry;
    if (manifest.target === 'agy' && isGlobal) {
      resolvedBaseDir = join(homedir(), '.gemini', 'config');
      resolvedEntry = {
        ...entry,
        dest: entry.dest.replace(/^\.agents\/?/, ''),
      };
    }

    const files = await resolveEntryFiles(resolvedEntry, presetsDir, resolvedBaseDir);
    const isTemplate = entry.template === true;

    for (const { src, dest } of files) {
      results.push(
        await applySingleFile(src, dest, strategy, force, dryRun, isTemplate, modelConfig, locale)
      );
    }
  }

  return results;
}
