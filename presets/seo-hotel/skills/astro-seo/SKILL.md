---
id: astro-seo
version: 1.0.0
name: Astro SEO Validator
description: >
  SEO validation specific to Astro framework projects. Checks static generation,
  meta tag rendering, Content Collections usage, Island Architecture implications
  for SEO, image optimization, sitemap generation, and Astro-specific best practices.

user-invokable: true
license: MIT
metadata:
  author: codeconductor
  category: seo

compatibility:
  tools: [claude, codex, gemini, opencode]
  stacks:
    languages: [typescript, javascript]
    frameworks: [astro]

risk:
  level: low
  can_execute_shell: false
  can_modify_files: true
  requires_network: false

inputs: []

outputs:
  - name: report
    type: markdown
    description: Astro-specific SEO validation report

quality:
  reviewed_by: codeconductor-core
  version: 0.3.0
---

# Astro SEO Validator

## Purpose

Validate SEO best practices specific to Astro framework projects. Astro's static-first
approach and Islands Architecture have unique SEO implications that generic tools miss.

## Invocation

```bash
codeconductor seo audit-astro --path ./src
codeconductor seo audit-astro --path ./src --format json
```

## Audit Checks

### Astro Configuration

| Check | Severity | Details |
|-------|----------|---------|
| `site` configured in astro.config | FAIL | Required for canonical URLs and sitemap |
| `output: 'static'` or `'hybrid'` | WARNING | SSR pages need explicit caching strategy |
| `@astrojs/sitemap` integration | FAIL | Sitemap generation is essential |
| Image optimization enabled | WARNING | `astro:assets` or `@astrojs/image` for automatic optimization |
| `trailingSlash` configured | SUGGESTION | Consistent URL format prevents duplicate content |

### Meta Tags (Astro Components)

| Check | Severity | Details |
|-------|----------|---------|
| `<title>` in layout | FAIL | Every page needs a title via layout or head |
| Meta description | FAIL | Dynamic per-page descriptions |
| Canonical URL | FAIL | Use `Astro.url` for canonical |
| OG tags | WARNING | Open Graph for social sharing |
| JSON-LD injection | WARNING | Structured data in `<Head>` component |

### Recommended Astro SEO pattern

```astro
---
// src/layouts/BaseLayout.astro
interface Props {
  title: string;
  description: string;
  image?: string;
  schema?: object;
}

const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---

<head>
  <title>{title} | Canto Vallarta</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonicalURL} />

  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalURL} />
  <meta property="og:image" content={image ?? '/og-default.jpg'} />
  <meta property="og:type" content="website" />

  {schema && (
    <script type="application/ld+json" set:html={JSON.stringify(schema)} />
  )}
</head>
```

### Content Collections

| Check | Severity | Details |
|-------|----------|---------|
| Collections defined in `src/content/config.ts` | WARNING | Type-safe content management |
| Content schema includes SEO fields | WARNING | title, description, image, schema fields |
| `getCollection()` used for page generation | SUGGESTION | Static generation from collections |
| Draft content excluded from build | WARNING | `draft: true` pages should not be published |

### Recommended Content Collection schema

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const rooms = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    image: z.string(),
    priceRange: z.string(),
    amenities: z.array(z.string()),
    schema: z.object({
      '@type': z.literal('HotelRoom'),
      name: z.string(),
      occupancy: z.number(),
    }).optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { rooms };
```

### Islands Architecture SEO

| Check | Severity | Details |
|-------|----------|---------|
| Critical content is static | FAIL | SEO-critical content must not be in client islands |
| `<slot>` used for SEO content | WARNING | Slots render at build time |
| `client:*` directives on non-interactive content | FAIL | Static content should not be hydrated |
| `client:only` for third-party scripts | WARNING | Analytics, chat widgets should use `client:only` |

### Anti-patterns

```astro
<!-- BAD: SEO content in client island -->
<RoomDescription client:load />

<!-- GOOD: Static SEO content, interactive elements in island -->
<div class="room-description">
  <Content />  <!-- Static, crawlable -->
  <BookingWidget client:load />  <!-- Interactive, not SEO-critical -->
</div>
```

### Image Optimization

| Check | Severity | Details |
|-------|----------|---------|
| `<Image>` component used | WARNING | Automatic format conversion (WebP/AVIF) |
| `width` and `height` set | FAIL | Prevents CLS |
| `alt` text present | FAIL | Accessibility and SEO |
| Responsive sizes configured | WARNING | `sizes` attribute for responsive images |
| Images in public/ are optimized | WARNING | Manual images bypass Astro optimization |

### Sitemap

| Check | Severity | Details |
|-------|----------|---------|
| `@astrojs/sitemap` installed | FAIL | Required for sitemap generation |
| Custom `serialize` function | SUGGESTION | Add hreflang, image entries |
| Dynamic routes in sitemap | WARNING | Ensure all generated pages are included |
| `lastmod` dates present | SUGGESTION | Helps search engines prioritize crawling |

### Recommended sitemap customization

```typescript
// astro.config.ts
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.cantovallarta.com',
  integrations: [
    sitemap({
      serialize(item) {
        // Add hreflang for multilingual sites
        item.links = [
          { lang: 'en', url: item.url },
          { lang: 'es', url: item.url.replace('/en/', '/es/') },
        ];
        return item;
      },
    }),
  ],
});
```

### Performance (Astro-specific)

| Check | Severity | Details |
|-------|----------|---------|
| No unnecessary `client:load` | WARNING | Hydration increases JS bundle |
| `client:visible` for below-fold islands | SUGGESTION | Lazy hydration |
| `client:media` for viewport-dependent islands | SUGGESTION | Hydrate only at specific breakpoints |
| View transitions configured | SUGGESTION | Astro View Transitions for SPA-like navigation |

## Output Format

```text
Astro SEO Audit
===============
Path: ./src
Framework: Astro 5.x
Output mode: static
Timestamp: 2026-05-29T06:40:00Z

Configuration:
  [FAIL]    site not configured in astro.config.ts
  [PASS]    @astrojs/sitemap installed
  [WARNING] output: 'server' — ensure caching strategy for SEO pages

Content:
  [PASS]    12 pages generated from content collections
  [WARNING] 3 pages missing meta description

Islands:
  [FAIL]    RoomDescription uses client:load for SEO-critical content
  [PASS]    BookingWidget correctly uses client:load for interactive element

Images:
  [WARNING] 8 images in public/ bypass Astro optimization
  [FAIL]    3 images missing alt text

--- Score ---
Astro SEO: 62/100
```
