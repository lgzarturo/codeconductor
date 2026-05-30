import { describe, expect, it } from 'bun:test';
import { validateGeo } from '../src/domain/seo/geo-validator';

const RICH_HTML = `<!DOCTYPE html>
<html>
<body>
  <h1>Paradise Resort Puerto Vallarta</h1>
  <p>Established in 2015, our 120-room resort has been rated 5 stars by Forbes Travel Guide.
  Located in Puerto Vallarta, Jalisco, Mexico, we offer 3 restaurants, 2 pools, and a full-service spa.
  Room rates start at $299 per night.</p>

  <h2>Amenities</h2>
  <ul>
    <li>Infinity pool</li>
    <li>Private beach access</li>
    <li>Full-service spa</li>
    <li>3 restaurants</li>
  </ul>

  <h2>Frequently Asked Questions</h2>
  <details>
    <summary>What is check-in time?</summary>
    <p>Check-in is at 3:00 PM.</p>
  </details>

  <time datetime="2026-05-01">May 2026</time>
</body>
</html>`;

const POOR_HTML = `<!DOCTYPE html>
<html>
<body>
  <h1>Welcome</h1>
  <p>Nice place to stay.</p>
</body>
</html>`;

describe('validateGeo', () => {
  it('passes all checks for content-rich HTML', () => {
    const checks = validateGeo(RICH_HTML, 'https://example.com/');

    const citable = checks.find((c) => c.name === 'citable-content');
    expect(citable?.severity).toBe('pass');

    const lists = checks.find((c) => c.name === 'structured-lists');
    expect(lists?.severity).toBe('pass');

    const faq = checks.find((c) => c.name === 'faq-section');
    expect(faq?.severity).toBe('pass');

    const freshness = checks.find((c) => c.name === 'content-freshness');
    expect(freshness?.severity).toBe('pass');
  });

  it('warns on poor content for AI citation', () => {
    const checks = validateGeo(POOR_HTML, 'https://example.com/');

    const citable = checks.find((c) => c.name === 'citable-content');
    expect(citable?.severity).toBe('warning');

    const lists = checks.find((c) => c.name === 'structured-lists');
    expect(lists?.severity).toBe('warning');

    const faq = checks.find((c) => c.name === 'faq-section');
    expect(faq?.severity).toBe('warning');
  });
});
