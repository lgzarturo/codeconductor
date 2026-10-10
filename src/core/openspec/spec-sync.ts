import { mkdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { writeFileAtomic } from './openspec-state';
import { hasMalformedRenames, requirementBlocks, specCapability, walkMarkdownFiles, type DeltaOperation } from './spec-files';

interface DeltaRequirement {
  readonly id: string;
  readonly markdown: string;
  readonly operation: DeltaOperation;
  readonly name?: string;
  readonly renamedFrom?: string;
}

interface PreparedWrite {
  readonly path: string;
  readonly content: string;
}

export interface SpecSyncResult {
  readonly success: boolean;
  readonly syncedPaths: string[];
  readonly errors: string[];
}

function deltaRequirements(markdown: string, capability: string): DeltaRequirement[] {
  return requirementBlocks(markdown, capability)
    .filter((requirement) => requirement.id !== null && requirement.deltaOperation !== undefined)
    .map((requirement) => ({
      id: requirement.id as string,
      markdown: requirement.markdown,
      operation: requirement.deltaOperation as DeltaOperation,
      name: requirement.name,
      renamedFrom: requirement.renamedFrom,
    }))
    .sort((a, b) => Number(b.operation === 'RENAMED') - Number(a.operation === 'RENAMED'));
}

function upsertRequirements(
  existing: string,
  deltas: DeltaRequirement[],
  source: string,
  capability: string,
): { ok: true; content: string } | { ok: false; error: string } {
  const requirements = requirementBlocks(existing, capability).filter(
    (requirement) => requirement.id !== null
  );
  const byId = new Map(
    requirements.map((requirement) => [requirement.id as string, requirement])
  );
  if (byId.size !== requirements.length) {
    return { ok: false, error: `${source}: durable spec has duplicate requirement IDs` };
  }
  const seen = new Set<string>();

  let next = existing.trimEnd();
  for (const delta of deltas) {
    if (delta.operation === 'RENAMED') {
      const current = byId.get(delta.renamedFrom ?? '');
      if (!current) return { ok: false, error: `${source}: RENAMED source ${delta.renamedFrom} does not exist` };
      if (delta.id !== delta.renamedFrom && byId.has(delta.id)) {
        return { ok: false, error: `${source}: RENAMED destination ${delta.id} already exists` };
      }
      const renamed = current.markdown.replace(/^### Requirement:.*$/m, () => `### Requirement: ${delta.name}`);
      next = next.replace(current.markdown, () => renamed);
      byId.delete(delta.renamedFrom ?? '');
      byId.set(delta.id, { ...current, id: delta.id, markdown: renamed });
      continue;
    }
    if (seen.has(delta.id)) return { ok: false, error: `${source}: duplicate delta requirement ${delta.id}` };
    seen.add(delta.id);
    const current = byId.get(delta.id);
    if (delta.operation === 'ADDED' && current) {
      return { ok: false, error: `${source}: ADDED requirement ${delta.id} already exists` };
    }
    if ((delta.operation === 'MODIFIED' || delta.operation === 'REMOVED') && !current) {
      return { ok: false, error: `${source}: ${delta.operation} requirement ${delta.id} does not exist` };
    }
    if (delta.operation === 'ADDED') {
      next = `${next}\n\n${delta.markdown}`;
      byId.set(delta.id, { id: delta.id, markdown: delta.markdown });
      continue;
    }
    if (!current) continue;
    if (delta.operation === 'MODIFIED') {
      // Replacer function: a replacement string would expand `$` patterns
      // (`$&`, `$1`) from spec content instead of writing them literally.
      next = next.replace(current.markdown, () => delta.markdown);
      byId.set(delta.id, { id: delta.id, markdown: delta.markdown });
    } else {
      next = next.replace(current.markdown, '').replace(/\n{3,}/g, '\n\n').trimEnd();
      byId.delete(delta.id);
    }
  }
  return { ok: true, content: `${next}\n` };
}

/**
 * Validate and apply all delta specs in a change before writing any durable
 * specification. A validation error therefore leaves durable specs untouched.
 */
export async function syncChangeSpecs(
  projectRoot: string,
  changePath: string,
): Promise<SpecSyncResult> {
  const root = resolve(projectRoot);
  const changeRoot = resolve(root, changePath);
  const changeSpecs = join(changeRoot, 'specs');
  if (changeRoot !== root && !changeRoot.startsWith(`${root}/`)) {
    return { success: false, syncedPaths: [], errors: ['Change path escapes project root'] };
  }

  const files = await walkMarkdownFiles(changeSpecs);
  if (files.length === 0) {
    return { success: false, syncedPaths: [], errors: ['Change folder has no delta specs'] };
  }

  const writes: PreparedWrite[] = [];
  for (const file of files) {
    const delta = await readFile(file, 'utf-8');
    if (hasMalformedRenames(delta)) {
      return { success: false, syncedPaths: [], errors: [`${relative(root, file)}: RENAMED requires paired FROM/TO requirement headings`] };
    }
    const requirements = deltaRequirements(delta, specCapability(file));
    if (requirements.some((requirement) => !requirement.name?.trim() || requirement.id.endsWith('/'))) {
      return { success: false, syncedPaths: [], errors: [`${relative(root, file)}: requirement names must produce a nonempty stable ID`] };
    }
    if (requirements.length === 0) {
      return {
        success: false,
        syncedPaths: [],
        errors: [`${relative(root, file)}: no delta requirements found`],
      };
    }
    const relativeSpec = relative(changeSpecs, file);
    const target = join(root, 'openspec', 'specs', relativeSpec);
    let existing = `# ${relativeSpec.replace(/\\/g, '/')}\n`;
    try {
      existing = await readFile(target, 'utf-8');
    } catch {
      // An ADDED-only delta may establish a new durable capability.
    }
    const merged = upsertRequirements(existing, requirements, relative(root, file), specCapability(file));
    if (!merged.ok) return { success: false, syncedPaths: [], errors: [merged.error] };
    writes.push({ path: target, content: merged.content });
  }

  for (const write of writes) {
    await mkdir(resolve(write.path, '..'), { recursive: true });
    await writeFileAtomic(write.path, write.content);
  }
  return {
    success: true,
    syncedPaths: writes.map((write) => relative(root, write.path).replace(/\\/g, '/')),
    errors: [],
  };
}
