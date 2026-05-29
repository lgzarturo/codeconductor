---
id: off-page
version: 1.0.0
name: SEO Off-Page & Marketing
description: >
  Guidance for off-page SEO strategy specific to hotel and hospitality websites.
  Covers backlink strategy, local citations, review management, social signals,
  and content marketing patterns for hotel websites.

user-invokable: true
license: MIT
metadata:
  author: codeconductor
  category: seo

compatibility:
  tools: [claude, codex, gemini, opencode]
  stacks:
    languages: []
    frameworks: []

risk:
  level: low
  can_execute_shell: false
  can_modify_files: true
  requires_network: false

inputs: []

outputs:
  - name: report
    type: markdown
    description: Off-page SEO strategy and checklist

quality:
  reviewed_by: codeconductor-core
  version: 0.3.0
---

# SEO Off-Page & Marketing for Hotels

## Purpose

Provide actionable off-page SEO guidance for hotel websites. This skill focuses on
strategy and implementation guidance, not automated crawling or link analysis.

## Hotel Citation Sources

### Essential (must-have)

| Platform | Type | Priority |
|----------|------|----------|
| Google Business Profile | Local | Critical |
| TripAdvisor | Review | Critical |
| Booking.com | OTA | High |
| Expedia | OTA | High |
| Apple Maps | Local | High |
| Bing Places | Local | Medium |
| Yelp | Review | Medium |

### NAP Consistency

**NAP** = Name, Address, Phone. Must be identical across all citations.

```text
GOOD:
  Google:    Canto Vallarta, Calle Hidalgo 123, Puerto Vallarta, +52 322 123 4567
  TripAdvisor: Canto Vallarta, Calle Hidalgo 123, Puerto Vallarta, +52 322 123 4567

BAD:
  Google:    Canto Vallarta Hotel, Hidalgo #123, PV, 322-123-4567
  TripAdvisor: Hotel Canto Vallarta, Calle Hidalgo 123, Puerto Vallarta, Jalisco
```

## Backlink Strategy for Hotels

### High-value link sources

1. **Tourism boards** — local and national tourism websites
2. **Travel bloggers** — review stays, destination guides
3. **Local business directories** — chamber of commerce, local associations
4. **Event websites** — conferences, weddings hosted at the hotel
5. **Press coverage** — local news, travel magazines
6. **Partner websites** — restaurants, tour operators, transport services

### Link-worthy content types

| Content Type | Link Potential | Effort |
|-------------|---------------|--------|
| Destination guides | High | Medium |
| Local event calendars | High | Low |
| Travel tips / itineraries | Medium | Medium |
| Photo galleries (high quality) | Medium | Low |
| Wedding/event pages | High | Medium |
| Sustainability initiatives | Medium | High |

## Schema Markup for Off-Page

### sameAs property

Connect your website to all external profiles:

```json
{
  "@type": "Hotel",
  "name": "Canto Vallarta",
  "sameAs": [
    "https://www.tripadvisor.com/Hotel_Review-...",
    "https://www.booking.com/hotel/...",
    "https://www.google.com/maps/place/...",
    "https://www.instagram.com/cantovallarta",
    "https://www.facebook.com/cantovallarta",
    "https://www.yelp.com/biz/..."
  ]
}
```

## Review Schema

### AggregateRating

```json
{
  "@type": "Hotel",
  "name": "Canto Vallarta",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "142",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

**Rules:**
- `ratingValue` must reflect actual reviews on the page
- `reviewCount` must match the number of reviews visible on the page
- Never fabricate review data — Google penalizes fake reviews severely

## Content Marketing Templates

### Blog post structure for hotel SEO

```markdown
# [Destination] Travel Guide: [Specific Topic]

## Why Visit [Destination]
[2-3 paragraphs with factual, citable content]

## Best Time to Visit
[Seasonal information with specific months/temperatures]

## Where to Stay
[Natural mention of the hotel with link]

## Things to Do
[List of nearby attractions with distances]

## Getting There
[Transport options from airport, bus station]

## FAQ
[5-10 questions with concise answers — highly citable by AI]
```

### FAQ schema for blog posts

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the best time to visit Puerto Vallarta?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The best time to visit Puerto Vallarta is from November to May..."
      }
    }
  ]
}
```

## Social Signals

### Platform-specific guidance

| Platform | Content Type | Frequency |
|----------|-------------|-----------|
| Instagram | Room photos, amenities, local scenes | 3-5x/week |
| Facebook | Events, promotions, guest stories | 2-3x/week |
| TikTok | Short video tours, behind-the-scenes | 2-3x/week |
| Pinterest | Destination boards, room inspiration | 5-10 pins/week |

### Social profile optimization

- Use consistent hotel name and profile image across platforms
- Link back to website in bio/profile
- Use location tags for local discoverability
- Respond to reviews and comments promptly
