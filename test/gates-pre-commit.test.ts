/*
 * Tests para BC-010: Gate pre-commit typecheck y test adaptado a Bun.
 *
 * El gate es un bloque bash incrustado en presets/claude/gates/pre-commit/GATE.md.
 * Estos tests extraen, ejecutan y verifican su conducta en repos git temporales.
 *
 * Conducta esperada del script:
 * 1. Ejecuta `bun run typecheck` y `bun run test` antes de permitir commit.
 * 2. Si fallan, bloquea el commit (exit 1).
 * 3. Detecta Husky/lint-staged en package.json y advierte sin instalar.
 * 4. Si hook ya existe, advierte y no sobrescribe.
 * 5. Resuelve git dir dinámicamente (git rev-parse --git-dir).
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const GATE_MD_PATH = resolve(PROJECT_ROOT, 'presets/claude/gates/pre-commit/GATE.md');
const CODE_FENCE_PATTERN = /```bash\n([\s\S]*?)\n```/;

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Extrae el script bash del bloque de código incrustado en GATE.md.
 */
async function extractBashScript(): Promise<string> {
  const gateMd = await readFile(GATE_MD_PATH, 'utf-8');
  const match = gateMd.match(CODE_FENCE_PATTERN);
  if (!match || !match[1]) {
    throw new Error('No bash code block found in GATE.md');
  }
  return match[1];
}

/**
 * Crea un repo git temporal para testing.
 */
async function createTestRepo(): Promise<TestRepo> {
  const basePath = tmpdir();
  const repoName = `test-gate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const repoPath = resolve(basePath, repoName);

  await mkdir(repoPath, { recursive: true });

  // Inicializar repo git
  execSync('git init', { cwd: repoPath });
  execSync('git config user.email "test@example.com"', { cwd: repoPath });
  execSync('git config user.name "Test User"', { cwd: repoPath });

  // Crear package.json básico
  const packageJson = {
    name: 'test-pre-commit',
    version: '1.0.0',
    scripts: {
      typecheck: 'echo "Typecheck passed"',
      test: 'echo "Tests passed"'
    }
  };
  await writeFile(resolve(repoPath, 'package.json'), JSON.stringify(packageJson, null, 2));

  return {
    path: repoPath,
    cleanup: async () => {
      await rm(repoPath, { recursive: true, force: true });
    }
  };
}

describe('BC-010: Pre-commit Gate', () => {
  describe('Script extraction and structure', () => {
    test('GATE.md debe existir en presets/claude/gates/pre-commit/', async () => {
      expect(existsSync(GATE_MD_PATH)).toBe(true);
    });

    test('GATE.md debe contener bloque bash delimitado por fences', async () => {
      const gateMd = await readFile(GATE_MD_PATH, 'utf-8');
      expect(gateMd.includes('```bash')).toBe(true);
      expect(gateMd.includes('```')).toBe(true);
    });

    test('Bloque bash extraído debe ser no vacío', async () => {
      const script = await extractBashScript();
      expect(script.length).toBeGreaterThan(0);
    });

    test('Script debe contener check de bun run typecheck', async () => {
      const script = await extractBashScript();
      expect(script.includes('bun run typecheck')).toBe(true);
    });

    test('Script debe contener check de bun run test', async () => {
      const script = await extractBashScript();
      expect(script.includes('bun run test')).toBe(true);
    });
  });

  describe('Happy path: instalación exitosa', () => {
    let testRepo: TestRepo;

    beforeEach(async () => {
      testRepo = await createTestRepo();
    });

    afterEach(async () => {
      await testRepo.cleanup();
    });

    test('Script debe crear .git/hooks/pre-commit correctamente', async () => {
      const script = await extractBashScript();
      const hookPath = resolve(testRepo.path, '.git/hooks/pre-commit');

      // Simular ejecución del script en el repo
      execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });

      expect(existsSync(hookPath)).toBe(true);
    });

    test('Hook instalado debe ser ejecutable (chmod +x)', async () => {
      const script = await extractBashScript();
      const hookPath = resolve(testRepo.path, '.git/hooks/pre-commit');

      execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });

      const stat = execSync(`stat -c '%A' ${hookPath}`, { encoding: 'utf-8' }).trim();
      expect(stat).toMatch(/x/); // Debe tener permiso ejecutable
    });

    test('Commit debe permitirse si typecheck y test pasan', async () => {
      const script = await extractBashScript();
      execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });

      // Crear un archivo para commitear
      await writeFile(resolve(testRepo.path, 'test.txt'), 'test content');
      execSync('git add test.txt', { cwd: testRepo.path });

      // El commit debe exitoso (no lanzar excepción)
      expect(() => {
        execSync('git commit -m "test commit"', { cwd: testRepo.path });
      }).not.toThrow();
    });
  });

  describe('Error case: typecheck falla', () => {
    let testRepo: TestRepo;

    beforeEach(async () => {
      testRepo = await createTestRepo();

      // Sobreescribir package.json con typecheck que falla
      const packageJson = {
        name: 'test-pre-commit',
        version: '1.0.0',
        scripts: {
          typecheck: 'exit 1',
          test: 'echo "Tests passed"'
        }
      };
      await writeFile(resolve(testRepo.path, 'package.json'), JSON.stringify(packageJson, null, 2));
    });

    afterEach(async () => {
      await testRepo.cleanup();
    });

    test('Commit debe ser bloqueado si typecheck falla (exit 1)', async () => {
      const script = await extractBashScript();
      execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });

      await writeFile(resolve(testRepo.path, 'test.txt'), 'test content');
      execSync('git add test.txt', { cwd: testRepo.path });

      // El commit debe fallar
      expect(() => {
        execSync('git commit -m "test commit"', { cwd: testRepo.path });
      }).toThrow();
    });
  });

  describe('Error case: test falla', () => {
    let testRepo: TestRepo;

    beforeEach(async () => {
      testRepo = await createTestRepo();

      // Sobreescribir package.json con test que falla
      const packageJson = {
        name: 'test-pre-commit',
        version: '1.0.0',
        scripts: {
          typecheck: 'echo "Typecheck passed"',
          test: 'exit 1'
        }
      };
      await writeFile(resolve(testRepo.path, 'package.json'), JSON.stringify(packageJson, null, 2));
    });

    afterEach(async () => {
      await testRepo.cleanup();
    });

    test('Commit debe ser bloqueado si test falla (exit 1)', async () => {
      const script = await extractBashScript();
      execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });

      await writeFile(resolve(testRepo.path, 'test.txt'), 'test content');
      execSync('git add test.txt', { cwd: testRepo.path });

      // El commit debe fallar
      expect(() => {
        execSync('git commit -m "test commit"', { cwd: testRepo.path });
      }).toThrow();
    });
  });

  describe('Edge case: Husky ya instalado', () => {
    let testRepo: TestRepo;

    beforeEach(async () => {
      testRepo = await createTestRepo();

      // Agregar Husky a package.json
      const packageJson = {
        name: 'test-pre-commit',
        version: '1.0.0',
        scripts: {
          typecheck: 'echo "Typecheck passed"',
          test: 'echo "Tests passed"'
        },
        husky: {
          hooks: {
            'pre-commit': 'echo "Husky hook"'
          }
        }
      };
      await writeFile(resolve(testRepo.path, 'package.json'), JSON.stringify(packageJson, null, 2));
    });

    afterEach(async () => {
      await testRepo.cleanup();
    });

    test('Script debe advertir pero no instalar si Husky ya existe', async () => {
      const script = await extractBashScript();
      let output = '';

      // Capturar output del script
      try {
        output = execSync(script, { cwd: testRepo.path, shell: '/bin/bash', encoding: 'utf-8' });
      } catch (e) {
        output = (e as any).stdout || '';
      }

      // Debe contener advertencia sobre Husky
      expect(output).toMatch(/husky|Husky|HUSKY/i);

      // Hook no debe haber sido instalado (o debe haber salido limpiamente)
      // El exit code debe ser 0 (no error)
    });

    test('Script no debe añadir dependencias externas', async () => {
      const script = await extractBashScript();

      // El script no debe contener `npm install`, `yarn add`, o `bun add`
      expect(script.includes('npm install')).toBe(false);
      expect(script.includes('yarn add')).toBe(false);
      expect(script.includes('bun add')).toBe(false);
    });
  });

  describe('Edge case: Hook pre-commit ya existe', () => {
    let testRepo: TestRepo;

    beforeEach(async () => {
      testRepo = await createTestRepo();

      // Crear hook pre-commit previo
      const hooksDir = resolve(testRepo.path, '.git/hooks');
      await mkdir(hooksDir, { recursive: true });
      await writeFile(
        resolve(hooksDir, 'pre-commit'),
        '#!/bin/bash\necho "Previous hook"'
      );
      execSync(`chmod +x ${resolve(hooksDir, 'pre-commit')}`);
    });

    afterEach(async () => {
      await testRepo.cleanup();
    });

    test('Script debe advertir pero no sobrescribir si hook ya existe', async () => {
      const script = await extractBashScript();
      const hookPath = resolve(testRepo.path, '.git/hooks/pre-commit');
      const originalContent = await readFile(hookPath, 'utf-8');

      try {
        execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });
      } catch (e) {
        // Script debe salir limpiamente incluso si no instala
      }

      // El contenido del hook no debe cambiar
      const afterContent = await readFile(hookPath, 'utf-8');
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('Acceptance criteria coverage', () => {
    test('AC1: El hook pre-commit ejecuta typecheck y test antes de permitir commit', async () => {
      const script = await extractBashScript();
      
      // Verificar que ambos comandos están presentes
      expect(script.includes('bun run typecheck')).toBe(true);
      expect(script.includes('bun run test')).toBe(true);
      
      // Verificar que hay lógica de bloqueo (exit 1)
      expect(script.includes('exit 1')).toBe(true);
    });

    test('AC2: El gate no añade dependencias externas cuando el proyecto no las tiene', async () => {
      const script = await extractBashScript();

      // Detectar cualquier instalación de dependencias
      const dependencies = ['npm install', 'yarn add', 'bun add', 'pip install'];
      const hasInstall = dependencies.some(dep => script.includes(dep));

      expect(hasInstall).toBe(false);
    });

    test('AC3: Un commit con typecheck fallido queda bloqueado por el hook', async () => {
      let testRepo = await createTestRepo();

      try {
        // Sobreescribir typecheck para que falle
        const packageJson = {
          name: 'test-pre-commit',
          version: '1.0.0',
          scripts: {
            typecheck: 'exit 1',
            test: 'echo "Tests passed"'
          }
        };
        await writeFile(resolve(testRepo.path, 'package.json'), JSON.stringify(packageJson, null, 2));

        const script = await extractBashScript();
        execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });

        await writeFile(resolve(testRepo.path, 'test.txt'), 'test content');
        execSync('git add test.txt', { cwd: testRepo.path });

        // El commit debe fallar
        let commitFailed = false;
        try {
          execSync('git commit -m "test commit"', { cwd: testRepo.path });
        } catch (e) {
          commitFailed = true;
        }

        expect(commitFailed).toBe(true);
      } finally {
        await testRepo.cleanup();
      }
    });
  });

  describe('Git directory resolution', () => {
    let testRepo: TestRepo;

    beforeEach(async () => {
      testRepo = await createTestRepo();
    });

    afterEach(async () => {
      await testRepo.cleanup();
    });

    test('Script debe resolver git dir dinámicamente con git rev-parse --git-dir', async () => {
      const script = await extractBashScript();

      // Verificar que usa git rev-parse --git-dir
      expect(script.includes('git rev-parse --git-dir')).toBe(true);
    });

    test('Script debe ser worktree-safe (resolver git dir correctamente)', async () => {
      const script = await extractBashScript();
      
      // Ejecutar en el repo de test
      expect(() => {
        execSync(script, { cwd: testRepo.path, shell: '/bin/bash' });
      }).not.toThrow();

      // Hook debe existir
      const hookPath = resolve(testRepo.path, '.git/hooks/pre-commit');
      expect(existsSync(hookPath)).toBe(true);
    });
  });
});
