import { join } from 'node:path';
import { homedir } from 'node:os';
import { configExists, loadConfig } from '../core/config/config-loader';
import { loadTargetSecurityCompatibility } from '../core/security/target-compatibility';
import {
  checkUpdates,
  validateAgentFileSizes,
  validateAgentMarkers,
  validateSkillFrontmatterFiles,
  detectComplementaryTools,
} from '../core/presets/update-checker';
import { loadManifest, loadModelConfig, loadTargetCapabilities } from '../core/presets/manifest-loader';
import { INDIVIDUAL_TARGETS } from '../core/runner/runner-target';
import type { OutputMode } from '../utils/logger';

export interface DoctorOptions {
  readonly output: OutputMode;
  readonly projectRoot: string;
}

/**
 * Validate configuration and generated files
 */
export async function doctorCommand(
  options: DoctorOptions
): Promise<{ code: number; data?: unknown }> {
  const { projectRoot, output } = options;

  const checks: { name: string; status: 'pass' | 'fail' | 'warn' | 'info'; message: string }[] = [];

  try {
    // Check 1: Config exists
    const hasConfig = await configExists(projectRoot);
    if (hasConfig) {
      checks.push({
        name: 'config-exists',
        status: 'pass',
        message: '.codeconductor/config.yml exists',
      });
    } else {
      checks.push({
        name: 'config-exists',
        status: 'fail',
        message: '.codeconductor/config.yml not found. Run `codeconductor init` first.',
      });
      return {
        code: 4,
        data: {
          success: false,
          command: 'doctor',
          checks,
        },
      };
    }

    // Check 2: Config is valid
    const configResult = await loadConfig(projectRoot);
    if (configResult.success) {
      checks.push({
        name: 'config-valid',
        status: 'pass',
        message: 'Config is valid',
      });
    } else {
      checks.push({
        name: 'config-valid',
        status: 'fail',
        message: `Config validation failed: ${configResult.error.message}`,
      });
      return {
        code: 1,
        data: {
          success: false,
          command: 'doctor',
          checks,
        },
      };
    }

    // Check 3: Runner directories
    const runnerDirs = ['.opencode', '.claude', '.codex'];
    for (const dir of runnerDirs) {
      try {
        const { access } = await import('node:fs/promises');
        await access(join(projectRoot, dir));
        checks.push({
          name: `dir-${dir}`,
          status: 'pass',
          message: `${dir}/ exists`,
        });
      } catch {
        checks.push({
          name: `dir-${dir}`,
          status: 'warn',
          message: `${dir}/ not found (optional)`,
        });
      }
    }

    // Check 4: Preset version
    const config = configResult.data;
    if (config.presets.council.enabled) {
      checks.push({
        name: 'council-enabled',
        status: 'pass',
        message: `Council preset enabled (v${config.presets.council.version})`,
      });
    }

    // Check updates availability
    const localUpdates = await checkUpdates(projectRoot, false);
    const globalUpdates = await checkUpdates(homedir(), true);

    const updateDetails: string[] = [];
    if (localUpdates.hasUpdates) {
      if (localUpdates.council) updateDetails.push('local council preset');
      if (localUpdates.policy) updateDetails.push('local policy');
      const updatedLocalTargets = localUpdates.targets.filter(t => t.hasUpdate).map(t => t.target);
      if (updatedLocalTargets.length > 0) {
        updateDetails.push(`local targets (${updatedLocalTargets.join(', ')})`);
      }
      const updatedLocalSkills = localUpdates.skills.filter(s => s.hasUpdate).map(s => s.id);
      if (updatedLocalSkills.length > 0) {
        updateDetails.push(`local skills (${updatedLocalSkills.join(', ')})`);
      }
    }
    if (globalUpdates.hasUpdates) {
      if (globalUpdates.council) updateDetails.push('global council preset');
      if (globalUpdates.policy) updateDetails.push('global policy');
      const updatedGlobalTargets = globalUpdates.targets.filter(t => t.hasUpdate).map(t => t.target);
      if (updatedGlobalTargets.length > 0) {
        updateDetails.push(`global targets (${updatedGlobalTargets.join(', ')})`);
      }
      const updatedGlobalSkills = globalUpdates.skills.filter(s => s.hasUpdate).map(s => s.id);
      if (updatedGlobalSkills.length > 0) {
        updateDetails.push(`global skills (${updatedGlobalSkills.join(', ')})`);
      }
    }

    if (updateDetails.length > 0) {
      checks.push({
        name: 'updates-available',
        status: 'warn',
        message: `Updates available for: ${updateDetails.join(', ')}`,
      });
    } else {
      checks.push({
        name: 'updates-available',
        status: 'pass',
        message: 'All presets, targets, and skills are up to date',
      });
    }

    // Check agent file sizes
    const largeFilesLocal = await validateAgentFileSizes(projectRoot, false);
    const largeFilesGlobal = await validateAgentFileSizes(homedir(), true);
    const allLargeFiles = [...largeFilesLocal, ...largeFilesGlobal];

    if (allLargeFiles.length > 0) {
      checks.push({
        name: 'agent-file-sizes',
        status: 'warn',
        message: `The following files exceed 40KB: ${allLargeFiles.map((f) => f.path).join(', ')}`,
      });
    } else {
      checks.push({
        name: 'agent-file-sizes',
        status: 'pass',
        message: 'All agent files (AGENTS.md/CLAUDE.md) are under 40KB',
      });
    }

    // Check agent file markers
    const missingMarkersLocal = await validateAgentMarkers(projectRoot, false);
    const missingMarkersGlobal = await validateAgentMarkers(homedir(), true);
    const allMissingMarkers = [...missingMarkersLocal, ...missingMarkersGlobal];

    if (allMissingMarkers.length > 0) {
      checks.push({
        name: 'agent-file-markers',
        status: 'warn',
        message: `The following files have missing or invalid managed markers: ${allMissingMarkers.map((f) => `${f.path} (${f.error})`).join(', ')}`,
      });
    } else {
      checks.push({
        name: 'agent-file-markers',
        status: 'pass',
        message: 'All agent files have valid managed markers',
      });
    }

    // Manifests must parse against InstallManifestSchema for every target —
    // loadManifest() already validates internally; a thrown parse error here
    // means a hand-edited manifest is broken before anyone tries to install it.
    const manifestErrors: string[] = [];
    for (const target of INDIVIDUAL_TARGETS) {
      try {
        await loadManifest(target);
      } catch (e) {
        manifestErrors.push(`${target}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (manifestErrors.length > 0) {
      checks.push({
        name: 'manifest-schema',
        status: 'fail',
        message: `Invalid manifest(s): ${manifestErrors.join('; ')}`,
      });
    } else {
      checks.push({
        name: 'manifest-schema',
        status: 'pass',
        message: `All ${INDIVIDUAL_TARGETS.length} target manifests are valid`,
      });
    }

    // Target capability matrix must parse against TargetCapabilitiesSchema
    // for every target — loadTargetCapabilities() already validates
    // internally; a thrown error here means a hand-edited
    // src/presets/targets/<target>.yml is broken.
    const targetCapabilityErrors: string[] = [];
    for (const target of INDIVIDUAL_TARGETS) {
      try {
        await loadTargetCapabilities(target);
      } catch (e) {
        targetCapabilityErrors.push(`${target}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (targetCapabilityErrors.length > 0) {
      checks.push({
        name: 'target-capabilities',
        status: 'fail',
        message: `Invalid target capability file(s): ${targetCapabilityErrors.join('; ')}`,
      });
    } else {
      checks.push({
        name: 'target-capabilities',
        status: 'pass',
        message: `All ${INDIVIDUAL_TARGETS.length} target capability files are valid`,
      });
    }

    // Skills registry must parse against SkillsRegistrySchema
    const { readFile } = await import('node:fs/promises');
    const { SkillsRegistrySchema } = await import('../validation/schemas');
    const { SKILLS_REGISTRY_PATH } = await import('../core/presets/package-paths');
    try {
      const registryContent = await readFile(SKILLS_REGISTRY_PATH, 'utf-8');
      const registryData = JSON.parse(registryContent);
      const registryResult = SkillsRegistrySchema.safeParse(registryData);
      if (registryResult.success) {
        const skillCount = Object.keys(registryResult.data.skills).length;
        checks.push({
          name: 'skills-registry',
          status: 'pass',
          message: `Skills registry is valid (${skillCount} skills)`,
        });
      } else {
        checks.push({
          name: 'skills-registry',
          status: 'fail',
          message: `Skills registry validation failed: ${registryResult.error.message}`,
        });
      }
    } catch (e) {
      checks.push({
        name: 'skills-registry',
        status: 'fail',
        message: `Skills registry error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    // Cross-target model config parity — a role added to one target's
    // models/*.yml and missed in another silently falls back to an empty
    // model name for that target at render time.
    const modelConfigs = await Promise.all(
      INDIVIDUAL_TARGETS.map(async (target) => {
        try {
          const agents = (await loadModelConfig(target)).agents;
          return { target, agents };
        } catch {
          return null;
        }
      })
    );
    const loadedConfigs = modelConfigs.filter((c): c is NonNullable<(typeof modelConfigs)[number]> => c !== null);
    const allRoles = new Set(loadedConfigs.flatMap((c) => Object.keys(c.agents)));
    const roleGaps: string[] = [];
    for (const role of allRoles) {
      const missingIn = loadedConfigs.filter((c) => !(role in c.agents)).map((c) => c.target);
      if (missingIn.length > 0) {
        roleGaps.push(`${role} missing in ${missingIn.join(', ')}`);
      }
    }
    if (roleGaps.length > 0) {
      checks.push({
        name: 'model-config-parity',
        status: 'warn',
        message: `Role parity gaps across target model configs: ${roleGaps.join('; ')}`,
      });
    } else {
      checks.push({
        name: 'model-config-parity',
        status: 'pass',
        message: `All ${allRoles.size} agent roles are defined for every target`,
      });
    }

    // Installed skill frontmatter — same rule the frontmatter-parity test
    // enforces on the preset sources, applied here to what actually landed
    // in this project after install.
    const skillFrontmatterLocal = await validateSkillFrontmatterFiles(projectRoot, false);
    const skillFrontmatterGlobal = await validateSkillFrontmatterFiles(homedir(), true);
    const allSkillFrontmatterErrors = [...skillFrontmatterLocal, ...skillFrontmatterGlobal];
    if (allSkillFrontmatterErrors.length > 0) {
      checks.push({
        name: 'skill-frontmatter',
        status: 'warn',
        message: `Invalid skill frontmatter: ${allSkillFrontmatterErrors.map((f) => `${f.path} (${f.error})`).join(', ')}`,
      });
    } else {
      checks.push({
        name: 'skill-frontmatter',
        status: 'pass',
        message: 'All installed skills have valid frontmatter',
      });
    }

    // Check 5: Target security compatibility
    const securityCompatibility = await loadTargetSecurityCompatibility();
    for (const compatibility of securityCompatibility) {
      checks.push({
        name: `security-${compatibility.target}`,
        status: compatibility.status,
        message:
          compatibility.status === 'pass'
            ? `${compatibility.target} can represent the canonical policy model`
            : `${compatibility.target} cannot enforce: ${compatibility.unsupportedRules.join(', ') || 'see warnings'}`,
      });
    }

    // Product OS artifacts
    const { existsSync } = await import('node:fs');
    const { ProductGraphSchema } = await import('../validation/schemas');
    const graphPath = join(projectRoot, '.codeconductor', 'product-graph.json');
    if (existsSync(graphPath)) {
      try {
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(graphPath, 'utf-8');
        const graph = ProductGraphSchema.parse(JSON.parse(raw));
        checks.push({
          name: 'product-graph',
          status: 'pass',
          message: `Product graph valid (${graph.nodes.length} nodes, ${graph.edges.length} edges)`,
        });
      } catch (e) {
        checks.push({
          name: 'product-graph',
          status: 'warn',
          message: `Product graph exists but invalid: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    } else {
      checks.push({
        name: 'product-graph',
        status: 'info',
        message: 'No product graph yet. Run `codeconductor ingest` to build product memory.',
      });
    }

    // Check complementary tools
    const compTools = detectComplementaryTools();
    const toolDetails = [
      { name: 'rtk', key: 'rtk' as const, label: 'RTK', desc: 'Run `brew install rtk` to compress command outputs' },
      { name: 'code-review-graph', key: 'codeReviewGraph' as const, label: 'code-review-graph', desc: 'Run `pipx install code-review-graph` to navigate symbol graph' },
      { name: 'token-savior', key: 'tokenSavior' as const, label: 'token-savior', desc: 'Run `pip install token-savior-recall` to use symbol navigation and persistent memory' },
      { name: 'caveman', key: 'caveman' as const, label: 'caveman', desc: 'Install JuliusBrussee/caveman plugin to shorten agent outputs' },
      { name: 'engram', key: 'engram' as const, label: 'Engram', desc: 'Install gentleman-programming/engram to persist session memories' },
      { name: 'gentle-ai', key: 'gentleAi' as const, label: 'Gentle AI', desc: 'Install Gentleman-Programming/gentle-ai to coordinate agent ecosystems' },
    ];

    for (const tool of toolDetails) {
      if (compTools[tool.key]) {
        checks.push({
          name: `tool-${tool.name}`,
          status: 'pass',
          message: `${tool.label} is installed and available`,
        });
      } else {
        checks.push({
          name: `tool-${tool.name}`,
          status: 'info',
          message: `${tool.label} is not installed. ${tool.desc}.`,
        });
      }
    }

    // All checks passed
    const failedCount = checks.filter((c) => c.status === 'fail').length;
    if (failedCount > 0) {
      return {
        code: 4,
        data: {
          success: false,
          command: 'doctor',
          checks,
        },
      };
    }

    return {
      code: 0,
      data: {
        success: true,
        command: 'doctor',
        checks,
        securityCompatibility,
      },
    };
  } catch (error) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'doctor',
        errors: [String(error)],
      },
    };
  }
}
