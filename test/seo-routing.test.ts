import { describe, expect, it } from 'bun:test';
import { parseArgs, routeCommand } from '../src/cli/router';

describe('SEO CLI routing', () => {
  it('parses seo audit command with --url', () => {
    const parsed = parseArgs(['seo', 'audit', '--url', 'https://example.com']);

    expect(parsed.command).toBe('seo');
    expect(parsed.subcommand).toBe('audit');
    expect(parsed.options.url).toBe('https://example.com');
  });

  it('parses seo audit command with --sitemap', () => {
    const parsed = parseArgs(['seo', 'audit', '--sitemap', 'https://example.com/sitemap.xml']);

    expect(parsed.command).toBe('seo');
    expect(parsed.subcommand).toBe('audit');
    expect(parsed.options.sitemap).toBe('https://example.com/sitemap.xml');
  });

  it('parses seo audit with --format and --fail-on', () => {
    const parsed = parseArgs(['seo', 'audit', '--url', 'https://example.com', '--format', 'json', '--fail-on', 'warning']);

    expect(parsed.options.format).toBe('json');
    expect(parsed.options['fail-on']).toBe('warning');
  });

  it('parses seo llms command', () => {
    const parsed = parseArgs(['seo', 'llms', '--sitemap', 'https://example.com/sitemap.xml']);

    expect(parsed.command).toBe('seo');
    expect(parsed.subcommand).toBe('llms');
    expect(parsed.options.sitemap).toBe('https://example.com/sitemap.xml');
  });

  it('parses seo audit with --delay', () => {
    const parsed = parseArgs(['seo', 'audit', '--url', 'https://example.com', '--delay', '1000']);

    expect(parsed.options.delay).toBe('1000');
  });

  it('parses seo llms with --output', () => {
    const parsed = parseArgs(['seo', 'llms', '--sitemap', 'https://example.com/sitemap.xml', '--output', 'custom-llms.txt']);

    expect(parsed.options.output).toBe('custom-llms.txt');
  });

  it('returns error for seo without subcommand', async () => {
    const parsed = parseArgs(['seo']);
    const result = await routeCommand(parsed, '/tmp');

    expect(result.code).toBe(1);
  });

  it('returns error for seo audit without url or sitemap', async () => {
    const parsed = parseArgs(['seo', 'audit']);
    const result = await routeCommand(parsed, '/tmp');

    expect(result.code).toBe(1);
    const data = result.data as Record<string, unknown>;
    expect(data.errors).toBeDefined();
  });

  it('returns error for seo llms without url or sitemap', async () => {
    const parsed = parseArgs(['seo', 'llms']);
    const result = await routeCommand(parsed, '/tmp');

    expect(result.code).toBe(1);
  });
});
