import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../core/config/config-loader';
import type { OutputMode } from '../utils/logger';

export interface HelpOptions {
  readonly projectRoot: string;
  readonly target?: string;
  readonly output: OutputMode;
}

interface PresetInventory {
  target: string;
  skills: string[];
  commands: string[];
  agents: string[];
  workflows: string[];
}

async function scanPresetDir(projectRoot: string, target: string): Promise<PresetInventory> {
  const inventory: PresetInventory = {
    target,
    skills: [],
    commands: [],
    agents: [],
    workflows: [],
  };

  const presetDir = join(projectRoot, 'presets', target);
  try {
    const entries = await readdir(presetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = join(presetDir, entry.name);
        const subEntries = await readdir(subDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isFile()) {
            const itemName = sub.name.replace(/\.[^.]+$/, '');
            if (entry.name === 'skills') inventory.skills.push(itemName);
            else if (entry.name === 'commands') inventory.commands.push(itemName);
            else if (entry.name === 'agents') inventory.agents.push(itemName);
            else if (entry.name === 'workflows') inventory.workflows.push(itemName);
          } else if (sub.isDirectory()) {
            if (entry.name === 'skills') inventory.skills.push(sub.name);
            else if (entry.name === 'agents') inventory.agents.push(sub.name);
          }
        }
      }
    }
  } catch {
    // Preset dir doesn't exist — return empty inventory
  }

  return inventory;
}

function renderHuman(inventory: PresetInventory, defaultTarget: string): string {
  const lines: string[] = [
    `CodeConductor Help — ${inventory.target}${inventory.target === defaultTarget ? ' (active)' : ''}`,
    '',
  ];

  lines.push(`Skills (${inventory.skills.length}):`);
  if (inventory.skills.length === 0) {
    lines.push('  (none)');
  } else {
    for (const skill of inventory.skills.sort()) {
      lines.push(`  - ${skill}`);
    }
  }

  lines.push('');
  lines.push(`Subagents (${inventory.agents.length}):`);
  if (inventory.agents.length === 0) {
    lines.push('  (none)');
  } else {
    for (const agent of inventory.agents.sort()) {
      lines.push(`  - ${agent}`);
    }
  }

  lines.push('');
  lines.push(`Commands (${inventory.commands.length}):`);
  if (inventory.commands.length === 0) {
    lines.push('  (none)');
  } else {
    for (const cmd of inventory.commands.sort()) {
      lines.push(`  - ${cmd}`);
    }
  }

  if (inventory.workflows.length > 0) {
    lines.push('');
    lines.push(`Workflows (${inventory.workflows.length}):`);
    for (const wf of inventory.workflows.sort()) {
      lines.push(`  - ${wf}`);
    }
  }

  lines.push('');
  lines.push('Stack-specific presets (v0.4.0):');
  lines.push('  ts-next-drizzle     Next.js / Astro, Tailwind, Drizzle ORM, Bun, Postgres');
  lines.push('  spring-kotlin-jpa   Spring Boot, Kotlin/Java, Gradle, JPA, Hibernate');
  lines.push('  laravel-tall        Laravel, Blade, Livewire, Alpine.js');
  lines.push('  python-data-api     Python, FastAPI, Django, uv');
  lines.push('  Browse: presets/<preset-name>/agents/ — copy into the target runner.');
  lines.push('  Registry: src/core/presets/preset-registry.ts (listPresets / getPreset).');

  return lines.join('\n');
}

/**
 * cc-help command — reads the active preset and prints an inventory
 * containing Skills, Subagents, and active commands.
 */
export async function helpCommand(
  options: HelpOptions,
): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, target: overrideTarget, output } = options;

  try {
    let defaultTarget = 'opencode';

    // Try to load config to get the active target
    try {
      const configResult = await loadConfig(projectRoot);
      if (configResult.success) {
        defaultTarget = configResult.data.defaults.target;
      }
    } catch {
      // Config doesn't exist — use default
    }

    const target = overrideTarget ?? defaultTarget;
    const inventory = await scanPresetDir(projectRoot, target);

    if (output === 'json') {
      return {
        code: 0,
        data: {
          success: true,
          command: 'help',
          inventory,
          defaultTarget,
        },
      };
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'help',
        message: renderHuman(inventory, defaultTarget),
        inventory,
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'help',
        errors: [String(error)],
      },
    };
  }
}
