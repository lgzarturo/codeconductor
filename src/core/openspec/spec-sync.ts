import { mkdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { writeFileAtomic } from './openspec-state';
import { requirementBlocks, walkMarkdownFiles } from './spec-files';

type DeltaOperation = 'ADDED' | 'MODIFIED' | 'REMOVED';

interface DeltaRequirement {
  readonly id: string;
  readonly markdown: string;
  readonly operation: DeltaOperation;
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

const SECTION_HEADING = /^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/gm;

function deltaRequirements(markdown: string): DeltaRequirement[] {
  const sections = [...markdown.matchAll(SECTION_HEADING)];
  return sections.flatMap((section, index) => {
    const start = (section.index ?? 0) + section[0].length;
    const end = sections[index + 1]?.index ?? markdown.length;
    const operation = section[1] as DeltaOperation;
    return requirementBlocks(markdown.slice(start, end))
      .filter((requirement) => requirement.id !== null)
      .map((requirement) => ({
        id: requirement.id as string,
        markdown: requirement.markdown,
        operation,
      }));
  });
}

function upsertRequirements(
  existing: string,
  deltas: DeltaRequirement[],
  source: string,
): { ok: true; content: string } | { ok: false; error: string } {
  const requirements = requirementBlocks(existing).filter(
    (requirement) => requirement.id !== null
  );
  const byId = new Map(
    requirements.map((requirement) => [requirement.id as string, requirement])
  );
  if (byId.size !== requirements.length) {
    return { ok: false, error: `${source}: durable spec has duplicate requirement IDs` };
  }
  const seen = new Set<string>();

  for (const delta of deltas) {
    if (seen.has(delta.id)) {
      return { ok: false, error: `${source}: duplicate delta requirement ${delta.id}` };
    }
    seen.add(delta.id);
    const current = byId.get(delta.id);
    if (delta.operation === 'ADDED' && current) {
      return { ok: false, error: `${source}: ADDED requirement ${delta.id} already exists` };
    }
    if ((delta.operation === 'MODIFIED' || delta.operation === 'REMOVED') && !current) {
      return { ok: false, error: `${source}: ${delta.operation} requirement ${delta.id} does not exist` };
    }
  }

  let next = existing.trimEnd();
  for (const delta of deltas) {
    const current = byId.get(delta.id);
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
    const requirements = deltaRequirements(delta);
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
    const merged = upsertRequirements(existing, requirements, relative(root, file));
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
