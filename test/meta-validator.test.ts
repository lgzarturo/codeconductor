import { describe, expect, it } from 'bun:test';
import { validateMeta } from '../src/domain/seo/meta-validator';

const GOOD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Luxury Hotel in Vallarta - 5 Star Resort</title>
  <meta name="description" content="Experience luxury at its finest. Our 5-star resort in Puerto Vallarta offers ocean-view rooms, spa, and world-class dining. Book your stay today.">
  <link rel="canonical" href="https://www.example.com/">
  <meta property="og:title" content="Luxury Hotel in Vallarta">
  <meta property="og:description" content="5-star resort in Puerto Vallarta">
  <meta property="og:image" content="https://www.example.com/hero.jpg">
  <meta property="og:url" content="https://www.example.com/">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <h1>Welcome to Paradise Resort</h1>
  <h2>Our Rooms</h2>
  <h3>Ocean Suite</h3>
  <img src="room.jpg" alt="Ocean view suite">
  <a href="/rooms">View all rooms</a>
  <a href="/about">About us</a>
</body>
</html>`;

const BAD_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Hi</title>
</head>
<body>
  <h1>Title</h1>
  <h1>Another Title</h1>
  <h4>Skipped heading</h4>
  <img src="photo.jpg">
  <img src="photo2.jpg">
</body>
</html>`;

describe('validateMeta', () => {
  it('passes all checks for well-formed HTML', () => {
    const checks = validateMeta(GOOD_HTML, 'https://www.example.com/', 1500);

    const errors = checks.filter((c) => c.severity === 'error');
    expect(errors).toHaveLength(0);

    const titleCheck = checks.find((c) => c.name === 'title-tag');
    expect(titleCheck?.severity).toBe('pass');

    const descCheck = checks.find((c) => c.name === 'meta-description');
    expect(descCheck?.severity).toBe('pass');

    const h1Check = checks.find((c) => c.name === 'h1-tag');
    expect(h1Check?.severity).toBe('pass');

    const httpsCheck = checks.find((c) => c.name === 'https');
    expect(httpsCheck?.severity).toBe('pass');

    const viewportCheck = checks.find((c) => c.name === 'viewport');
    expect(viewportCheck?.severity).toBe('pass');

    const langCheck = checks.find((c) => c.name === 'html-lang');
    expect(langCheck?.severity).toBe('pass');
  });

  it('detects missing meta description', () => {
    const checks = validateMeta(BAD_HTML, 'http://example.com/', 2000);

    const descCheck = checks.find((c) => c.name === 'meta-description');
    expect(descCheck?.severity).toBe('error');
  });

  it('detects short title', () => {
    const checks = validateMeta(BAD_HTML, 'http://example.com/', 2000);

    const titleCheck = checks.find((c) => c.name === 'title-tag');
    expect(titleCheck?.severity).toBe('warning');
    expect(titleCheck?.message).toContain('too short');
  });

  it('detects multiple h1 tags', () => {
    const checks = validateMeta(BAD_HTML, 'http://example.com/', 2000);

    const h1Check = checks.find((c) => c.name === 'h1-tag');
    expect(h1Check?.severity).toBe('warning');
    expect(h1Check?.message).toContain('Multiple');
  });

  it('detects missing alt text', () => {
    const checks = validateMeta(BAD_HTML, 'http://example.com/', 2000);

    const altCheck = checks.find((c) => c.name === 'img-alt-text');
    expect(altCheck?.severity).toBe('warning');
    expect(altCheck?.message).toContain('2');
  });

  it('detects missing viewport', () => {
    const checks = validateMeta(BAD_HTML, 'http://example.com/', 2000);

    const viewportCheck = checks.find((c) => c.name === 'viewport');
    expect(viewportCheck?.severity).toBe('error');
  });

  it('detects missing html lang', () => {
    const checks = validateMeta(BAD_HTML, 'http://example.com/', 2000);

    const langCheck = checks.find((c) => c.name === 'html-lang');
    expect(langCheck?.severity).toBe('warning');
  });

  it('detects non-HTTPS', () => {
    const checks = validateMeta(GOOD_HTML, 'http://www.example.com/', 1500);

    const httpsCheck = checks.find((c) => c.name === 'https');
    expect(httpsCheck?.severity).toBe('error');
  });

  it('warns on slow response time', () => {
    const checks = validateMeta(GOOD_HTML, 'https://www.example.com/', 4000);

    const timeCheck = checks.find((c) => c.name === 'response-time');
    expect(timeCheck?.severity).toBe('warning');
  });

  it('errors on very slow response time', () => {
    const checks = validateMeta(GOOD_HTML, 'https://www.example.com/', 6000);

    const timeCheck = checks.find((c) => c.name === 'response-time');
    expect(timeCheck?.severity).toBe('error');
  });

  it('detects noindex directive', () => {
    const html = `<html lang="en"><head><title>Test Page Title That Is Long Enough</title><meta name="robots" content="noindex, nofollow"></head><body><h1>Test</h1></body></html>`;
    const checks = validateMeta(html, 'https://example.com/', 1000);

    const noindex = checks.find((c) => c.name === 'robots-noindex');
    expect(noindex?.severity).toBe('warning');

    const nofollow = checks.find((c) => c.name === 'robots-nofollow');
    expect(nofollow?.severity).toBe('warning');
  });

  it('detects missing og tags', () => {
    const checks = validateMeta(BAD_HTML, 'http://example.com/', 2000);

    const ogTitle = checks.find((c) => c.name === 'og-title');
    expect(ogTitle?.severity).toBe('warning');

    const ogDesc = checks.find((c) => c.name === 'og-description');
    expect(ogDesc?.severity).toBe('warning');

    const ogImage = checks.find((c) => c.name === 'og-image');
    expect(ogImage?.severity).toBe('warning');
  });
});
