import type { AuditCheck } from './seo-types';

function extractMetaContent(html: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractPropertyContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : undefined;
}

function extractCanonical(html: string): string | undefined {
  const match = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  return match ? match[1].trim() : undefined;
}

function extractH1Tags(html: string): string[] {
  const regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractHeadingHierarchy(html: string): { tag: string; text: string }[] {
  const regex = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const results: { tag: string; text: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    results.push({ tag: match[1].toLowerCase(), text: match[2].trim() });
  }
  return results;
}

function extractImgWithoutAlt(html: string): number {
  const imgRegex = /<img[^>]*>/gi;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    if (!/alt=["'][^"']+["']/i.test(match[0])) {
      count++;
    }
  }
  return count;
}

function extractHtmlLang(html: string): string | undefined {
  const match = html.match(/<html[^>]*lang=["']([^"']*)["']/i);
  return match ? match[1].trim() : undefined;
}

function extractViewport(html: string): string | undefined {
  return extractMetaContent(html, 'viewport');
}

function extractInternalLinks(html: string, baseUrl: string): number {
  let domain: string;
  try {
    domain = new URL(baseUrl).hostname;
  } catch {
    return 0;
  }
  const linkRegex = /href=["']([^"']*)["']/gi;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname === domain) count++;
    } catch {
      if (href.startsWith('/')) count++;
    }
  }
  return count;
}

export function validateMeta(html: string, url: string, responseTime: number): AuditCheck[] {
  const checks: AuditCheck[] = [];

  const title = extractTitle(html);
  if (!title) {
    checks.push({
      name: 'title-tag',
      category: 'meta',
      severity: 'error',
      message: 'Missing <title> tag',
      remediation: 'Add a <title> tag with 30-60 characters describing the page content.',
    });
  } else if (title.length < 30) {
    checks.push({
      name: 'title-tag',
      category: 'meta',
      severity: 'warning',
      message: `Title too short (${title.length} chars): "${title}"`,
      remediation: 'Expand title to 30-60 characters.',
    });
  } else if (title.length > 60) {
    checks.push({
      name: 'title-tag',
      category: 'meta',
      severity: 'warning',
      message: `Title too long (${title.length} chars): "${title}"`,
      remediation: 'Shorten title to 30-60 characters to avoid truncation in SERPs.',
    });
  } else {
    checks.push({
      name: 'title-tag',
      category: 'meta',
      severity: 'pass',
      message: `Title OK (${title.length} chars): "${title}"`,
    });
  }

  const description = extractMetaContent(html, 'description');
  if (!description) {
    checks.push({
      name: 'meta-description',
      category: 'meta',
      severity: 'error',
      message: 'Missing <meta name="description">',
      remediation: 'Add a meta description with 120-160 characters summarizing the page.',
    });
  } else if (description.length < 120) {
    checks.push({
      name: 'meta-description',
      category: 'meta',
      severity: 'warning',
      message: `Description too short (${description.length} chars)`,
      remediation: 'Expand description to 120-160 characters.',
    });
  } else if (description.length > 160) {
    checks.push({
      name: 'meta-description',
      category: 'meta',
      severity: 'warning',
      message: `Description too long (${description.length} chars)`,
      remediation: 'Shorten description to 120-160 characters.',
    });
  } else {
    checks.push({
      name: 'meta-description',
      category: 'meta',
      severity: 'pass',
      message: `Description OK (${description.length} chars)`,
    });
  }

  const canonical = extractCanonical(html);
  if (!canonical) {
    checks.push({
      name: 'canonical',
      category: 'meta',
      severity: 'warning',
      message: 'Missing <link rel="canonical">',
      remediation: 'Add a canonical URL to prevent duplicate content issues.',
    });
  } else if (canonical !== url) {
    checks.push({
      name: 'canonical',
      category: 'meta',
      severity: 'info',
      message: `Canonical (${canonical}) differs from current URL (${url})`,
    });
  } else {
    checks.push({
      name: 'canonical',
      category: 'meta',
      severity: 'pass',
      message: `Canonical matches URL`,
    });
  }

  const robots = extractMetaContent(html, 'robots');
  if (robots) {
    if (/noindex/i.test(robots)) {
      checks.push({
        name: 'robots-noindex',
        category: 'crawl',
        severity: 'warning',
        message: `Page has noindex directive: "${robots}"`,
        remediation: 'Remove noindex if this page should appear in search results.',
      });
    }
    if (/nofollow/i.test(robots)) {
      checks.push({
        name: 'robots-nofollow',
        category: 'crawl',
        severity: 'warning',
        message: `Page has nofollow directive: "${robots}"`,
      });
    }
  } else {
    checks.push({
      name: 'robots-directive',
      category: 'crawl',
      severity: 'pass',
      message: 'No restrictive robots directive',
    });
  }

  const hreflangRegex = /hreflang=["']([^"']*)["']/gi;
  const hreflangs: string[] = [];
  let hreflangMatch: RegExpExecArray | null;
  while ((hreflangMatch = hreflangRegex.exec(html)) !== null) {
    hreflangs.push(hreflangMatch[1]);
  }
  if (hreflangs.length > 0) {
    checks.push({
      name: 'hreflang',
      category: 'meta',
      severity: 'pass',
      message: `Found ${hreflangs.length} hreflang tags: ${hreflangs.join(', ')}`,
    });
  }

  const ogTitle = extractPropertyContent(html, 'og:title');
  const ogDescription = extractPropertyContent(html, 'og:description');
  const ogImage = extractPropertyContent(html, 'og:image');
  const ogUrl = extractPropertyContent(html, 'og:url');

  if (!ogTitle) {
    checks.push({
      name: 'og-title',
      category: 'social',
      severity: 'warning',
      message: 'Missing og:title',
      remediation: 'Add <meta property="og:title" content="..."> for social sharing.',
    });
  } else {
    checks.push({ name: 'og-title', category: 'social', severity: 'pass', message: 'og:title present' });
  }

  if (!ogDescription) {
    checks.push({
      name: 'og-description',
      category: 'social',
      severity: 'warning',
      message: 'Missing og:description',
      remediation: 'Add <meta property="og:description" content="...">.',
    });
  } else {
    checks.push({ name: 'og-description', category: 'social', severity: 'pass', message: 'og:description present' });
  }

  if (!ogImage) {
    checks.push({
      name: 'og-image',
      category: 'social',
      severity: 'warning',
      message: 'Missing og:image',
      remediation: 'Add <meta property="og:image" content="..."> with a 1200x630px image.',
    });
  } else {
    checks.push({ name: 'og-image', category: 'social', severity: 'pass', message: 'og:image present' });
  }

  if (!ogUrl) {
    checks.push({
      name: 'og-url',
      category: 'social',
      severity: 'info',
      message: 'Missing og:url',
    });
  }

  const twitterCard = extractMetaContent(html, 'twitter:card');
  if (!twitterCard) {
    checks.push({
      name: 'twitter-card',
      category: 'social',
      severity: 'info',
      message: 'Missing twitter:card',
      remediation: 'Add <meta name="twitter:card" content="summary_large_image">.',
    });
  } else {
    checks.push({ name: 'twitter-card', category: 'social', severity: 'pass', message: `twitter:card: ${twitterCard}` });
  }

  const h1Tags = extractH1Tags(html);
  if (h1Tags.length === 0) {
    checks.push({
      name: 'h1-tag',
      category: 'content',
      severity: 'error',
      message: 'Missing <h1> tag',
      remediation: 'Add exactly one <h1> tag with the main page heading.',
    });
  } else if (h1Tags.length > 1) {
    checks.push({
      name: 'h1-tag',
      category: 'content',
      severity: 'warning',
      message: `Multiple <h1> tags found (${h1Tags.length}): "${h1Tags.join('", "')}"`,
      remediation: 'Use only one <h1> per page. Convert extras to <h2>.',
    });
  } else {
    checks.push({
      name: 'h1-tag',
      category: 'content',
      severity: 'pass',
      message: `H1 OK: "${h1Tags[0]}"`,
    });
  }

  const headings = extractHeadingHierarchy(html);
  if (headings.length > 1) {
    let hasSkips = false;
    for (let i = 1; i < headings.length; i++) {
      const prev = parseInt(headings[i - 1].tag[1]);
      const curr = parseInt(headings[i].tag[1]);
      if (curr > prev + 1) {
        hasSkips = true;
        break;
      }
    }
    if (hasSkips) {
      checks.push({
        name: 'heading-hierarchy',
        category: 'content',
        severity: 'warning',
        message: 'Heading hierarchy has skipped levels (e.g., h2 → h4)',
        remediation: 'Ensure headings follow sequential order: h1 → h2 → h3.',
      });
    } else {
      checks.push({
        name: 'heading-hierarchy',
        category: 'content',
        severity: 'pass',
        message: `Heading hierarchy OK (${headings.length} headings)`,
      });
    }
  }

  const imgsWithoutAlt = extractImgWithoutAlt(html);
  if (imgsWithoutAlt > 0) {
    checks.push({
      name: 'img-alt-text',
      category: 'content',
      severity: 'warning',
      message: `${imgsWithoutAlt} image(s) missing alt text`,
      remediation: 'Add descriptive alt text to all images for accessibility and SEO.',
    });
  } else {
    checks.push({
      name: 'img-alt-text',
      category: 'content',
      severity: 'pass',
      message: 'All images have alt text',
    });
  }

  const internalLinks = extractInternalLinks(html, url);
  checks.push({
    name: 'internal-links',
    category: 'content',
    severity: internalLinks > 0 ? 'pass' : 'warning',
    message: `${internalLinks} internal links found`,
    remediation: internalLinks === 0 ? 'Add internal links to improve crawlability and page authority.' : undefined,
  });

  const lang = extractHtmlLang(html);
  if (!lang) {
    checks.push({
      name: 'html-lang',
      category: 'technical',
      severity: 'warning',
      message: 'Missing <html lang="..."> attribute',
      remediation: 'Add lang attribute to <html> tag (e.g., lang="en").',
    });
  } else {
    checks.push({
      name: 'html-lang',
      category: 'technical',
      severity: 'pass',
      message: `HTML lang: ${lang}`,
    });
  }

  const viewport = extractViewport(html);
  if (!viewport) {
    checks.push({
      name: 'viewport',
      category: 'technical',
      severity: 'error',
      message: 'Missing <meta name="viewport">',
      remediation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    });
  } else {
    checks.push({
      name: 'viewport',
      category: 'technical',
      severity: 'pass',
      message: 'Viewport meta tag present',
    });
  }

  const isHttps = url.startsWith('https://');
  checks.push({
    name: 'https',
    category: 'technical',
    severity: isHttps ? 'pass' : 'error',
    message: isHttps ? 'HTTPS enabled' : 'Site is not using HTTPS',
    remediation: isHttps ? undefined : 'Migrate to HTTPS for security and SEO ranking.',
  });

  if (responseTime < 3000) {
    checks.push({
      name: 'response-time',
      category: 'technical',
      severity: 'pass',
      message: `Response time: ${responseTime}ms`,
    });
  } else if (responseTime < 5000) {
    checks.push({
      name: 'response-time',
      category: 'technical',
      severity: 'warning',
      message: `Slow response time: ${responseTime}ms`,
      remediation: 'Optimize server response time to under 3 seconds.',
    });
  } else {
    checks.push({
      name: 'response-time',
      category: 'technical',
      severity: 'error',
      message: `Very slow response time: ${responseTime}ms`,
      remediation: 'Server response time exceeds 5 seconds. Investigate server performance.',
    });
  }

  return checks;
}
