import { describe, expect, test } from 'bun:test';
import {
  MANAGED_BEGIN_MARKER,
  MANAGED_END_MARKER,
  mergeManagedBlock,
} from '../../../../src/core/filesystem/safe-merger';

const block = (body: string) => `${MANAGED_BEGIN_MARKER}\n${body}\n${MANAGED_END_MARKER}`;

describe('core/filesystem/safe-merger', () => {
  test('happy path: no existing file writes the incoming content verbatim', () => {
    const incoming = block('v1');
    const result = mergeManagedBlock(null, incoming);
    expect(result.action).toBe('written');
    expect(result.content).toBe(incoming);
  });

  test('existing file without markers is fully replaced', () => {
    const result = mergeManagedBlock('legacy content', block('v1'));
    expect(result.action).toBe('written');
    expect(result.content).toBe(block('v1'));
  });

  test('edge case: only the managed block is replaced, surrounding text is preserved', () => {
    const existing = `# Header\n\n${block('old')}\n\n# Footer`;
    const incoming = block('new');
    const result = mergeManagedBlock(existing, incoming);
    expect(result.action).toBe('merged');
    expect(result.content).toContain('# Header');
    expect(result.content).toContain('# Footer');
    expect(result.content).toContain('new');
    expect(result.content).not.toContain('old');
  });

  test('error case: incoming content without exactly one marker pair throws', () => {
    expect(() => mergeManagedBlock(null, 'no markers here')).toThrow(/exactly one managed/);
    expect(() => mergeManagedBlock(null, `${MANAGED_BEGIN_MARKER}\nx`)).toThrow(/exactly one managed/);
  });

  test('error case: markers in the wrong order throw', () => {
    const reversed = `${MANAGED_END_MARKER}\nbody\n${MANAGED_BEGIN_MARKER}`;
    expect(() => mergeManagedBlock(null, reversed)).toThrow(/wrong order/);
  });

  test('error case: an existing file with malformed markers throws', () => {
    const existingBad = `${MANAGED_BEGIN_MARKER}\n${MANAGED_BEGIN_MARKER}\n${MANAGED_END_MARKER}`;
    expect(() => mergeManagedBlock(existingBad, block('new'))).toThrow(/exactly one managed/);
  });
});
