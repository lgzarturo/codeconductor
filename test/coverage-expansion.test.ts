import { beforeEach, describe, expect, test } from 'bun:test';
import { rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mergeManagedBlock, MANAGED_BEGIN_MARKER, MANAGED_END_MARKER } from '../src/core/filesystem/safe-merger';
import { PathResolver, createPathResolver } from '../src/core/filesystem/path-resolver';
import { renderTemplate, renderTemplates } from '../src/core/generation/template-renderer';
import { loadConfig, configExists } from '../src/core/config/config-loader';
import { writeConfig, getConfigPath } from '../src/core/config/config-writer';
import { validateModelConfig } from '../src/validation/schemas';

const TMP_DIR = resolve(import.meta.dir, '..', 'test', 'fixtures', 'coverage-tmp');

describe('Coverage Expansion — safe-merger unit tests', () => {
  test('U-101: mergeManagedBlock on null existing content writes incoming', () => {
    const incoming = `${MANAGED_BEGIN_MARKER}\nincoming\n${MANAGED_END_MARKER}`;
    const result = mergeManagedBlock(null, incoming);
    expect(result.action).toBe('written');
    expect(result.content).toBe(incoming);
  });

  test('U-102: mergeManagedBlock throws on multiple begin markers', () => {
    const incoming = `${MANAGED_BEGIN_MARKER}\nfirst\n${MANAGED_BEGIN_MARKER}\n${MANAGED_END_MARKER}`;
    expect(() => mergeManagedBlock('some existing', incoming)).toThrow(/must contain exactly one managed begin marker/);
  });

  test('U-102: mergeManagedBlock throws on markers in wrong order', () => {
    const incoming = `${MANAGED_END_MARKER}\ncontent\n${MANAGED_BEGIN_MARKER}`;
    expect(() => mergeManagedBlock('some existing', incoming)).toThrow(/markers in the wrong order/);
  });

  test('U-102b: mergeManagedBlock on existing content without markers overwrites with incoming', () => {
    const incoming = `${MANAGED_BEGIN_MARKER}\nincoming content\n${MANAGED_END_MARKER}`;
    const result = mergeManagedBlock('some existing content without markers', incoming);
    expect(result.action).toBe('written');
    expect(result.content).toBe(incoming);
  });
});

describe('Coverage Expansion — path-resolver unit tests', () => {
  test('U-103: PathResolver properties and isWithinRoot', () => {
    const resolver = createPathResolver(TMP_DIR);
    expect(resolver.getRoot()).toBe(resolve(TMP_DIR));
    expect(resolver.resolve('src', 'app.ts')).toBe(resolve(TMP_DIR, 'src', 'app.ts'));
    expect(resolver.join('src', 'app.ts')).toBe(join(resolve(TMP_DIR), 'src', 'app.ts'));
    expect(resolver.relative(resolve(TMP_DIR, 'src', 'app.ts'))).toBe('src/app.ts');
    
    // Check if within root
    expect(resolver.isWithinRoot(resolve(TMP_DIR, 'src'))).toBe(true);
    expect(resolver.isWithinRoot(resolve(TMP_DIR, '..', 'other'))).toBe(false);
  });
});

describe('Coverage Expansion — template-renderer unit tests', () => {
  test('U-104: renderTemplate substitutes string, array, number, boolean', () => {
    const template = 'Model: {{MODEL}}, Libraries: {{LIBS}}, Count: {{COUNT}}, Active: {{ACTIVE}}, Undefined: {{UNDEFINED}}';
    const data = {
      MODEL: 'haiku',
      LIBS: ['react', 'vue'],
      COUNT: 42,
      ACTIVE: true,
      UNDEFINED: undefined,
    };
    const rendered = renderTemplate(template, data);
    expect(rendered).toBe('Model: haiku, Libraries: react, vue, Count: 42, Active: true, Undefined: {{UNDEFINED}}');
  });

  test('U-105: renderTemplates processes list of strings', () => {
    const templates = ['Hello {{NAME}}', 'Goodbye {{NAME}}'];
    const data = { NAME: 'Arturo' };
    const rendered = renderTemplates(templates, data);
    expect(rendered).toEqual(['Hello Arturo', 'Goodbye Arturo']);
  });
});

describe('Coverage Expansion — config integration tests', () => {
  beforeEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
    await mkdir(TMP_DIR, { recursive: true });
  });

  test('I-201: loadConfig reports error when config file is missing', async () => {
    const result = await loadConfig(TMP_DIR);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Config file not found');
    }
  });

  test('I-201: loadConfig reports error when config is empty', async () => {
    const configPath = getConfigPath(TMP_DIR);
    await mkdir(join(TMP_DIR, '.codeconductor'), { recursive: true });
    await writeFile(configPath, '', 'utf-8');

    const result = await loadConfig(TMP_DIR);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Empty config file');
    }
  });

  test('I-201: loadConfig validation error on invalid configuration shape', async () => {
    const configPath = getConfigPath(TMP_DIR);
    await mkdir(join(TMP_DIR, '.codeconductor'), { recursive: true });
    await writeFile(configPath, 'defaults: { target: 12345 }', 'utf-8');

    const result = await loadConfig(TMP_DIR);
    expect(result.success).toBe(false);
  });

  test('I-202: writeConfig creates folder and config file, and does not overwrite without force', async () => {
    expect(await configExists(TMP_DIR)).toBe(false);
    
    // First write
    const writeResult1 = await writeConfig(TMP_DIR, {
      project: { name: 'test-proj', profile: 'node' }
    });
    expect(writeResult1.success).toBe(true);
    expect(await configExists(TMP_DIR)).toBe(true);

    const configPath = getConfigPath(TMP_DIR);
    const content1 = await readFile(configPath, 'utf-8');
    expect(content1).toContain('name: test-proj');

    // Second write without force (should skip write and preserve old config name)
    const writeResult2 = await writeConfig(TMP_DIR, {
      project: { name: 'overwritten-name', profile: 'node' }
    }, false);
    expect(writeResult2.success).toBe(true);
    const content2 = await readFile(configPath, 'utf-8');
    expect(content2).toContain('name: test-proj');
    expect(content2).not.toContain('name: overwritten-name');

    // Third write with force (should overwrite)
    const writeResult3 = await writeConfig(TMP_DIR, {
      project: { name: 'overwritten-name', profile: 'node' }
    }, true);
    expect(writeResult3.success).toBe(true);
    const content3 = await readFile(configPath, 'utf-8');
    expect(content3).toContain('name: overwritten-name');
  });
});

describe('Coverage Expansion — model config validation tests', () => {
  test('U-106: validateModelConfig parses valid model config correctly', () => {
    const validConfig = {
      target: 'opencode',
      agents: {
        orchestrator: {
          opencode: 'opencode/big-pickle',
          gemini: 'gemini-2.5-pro',
        },
        implementer: {
          opencode: 'opencode-go/deepseek-v4-flash',
        },
      },
      tools: {
        orchestrator: {
          read_file: 'custom-read-file',
        },
      },
      permissions: {
        read_file: 'allow',
      },
    };

    const parsed = validateModelConfig(validConfig);
    expect(parsed.target).toBe('opencode');
    expect(parsed.agents.orchestrator.opencode).toBe('opencode/big-pickle');
    expect(parsed.agents.implementer.opencode).toBe('opencode-go/deepseek-v4-flash');
    expect(parsed.tools?.orchestrator?.read_file).toBe('custom-read-file');
    expect(parsed.permissions?.read_file).toBe('allow');
  });

  test('U-107: validateModelConfig throws on invalid target', () => {
    const invalidConfig = {
      target: 'invalid-target', // Should be one of the enum values
      agents: {
        orchestrator: {
          gemini: 'gemini-2.5-pro',
        },
      },
    };

    expect(() => validateModelConfig(invalidConfig)).toThrow();
  });

  test('U-108: validateModelConfig throws on invalid agent model key type', () => {
    const invalidConfig = {
      target: 'gemini',
      agents: {
        orchestrator: {
          gemini: 123, // invalid type (must be string)
        },
      },
    };

    expect(() => validateModelConfig(invalidConfig)).toThrow();
  });
});

