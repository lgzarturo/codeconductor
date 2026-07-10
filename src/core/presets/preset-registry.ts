/**
 * Preset registry - lists available presets
 */
export interface PresetInfo {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly path: string;
}

/**
 * Available presets
 */
export const PRESETS: PresetInfo[] = [
  {
    name: 'council',
    version: '0.1.0',
    description: 'Multi-agent council for code review and architecture',
    path: './presets/council/council.yml',
  },
  {
    name: 'seo-hotel',
    version: '0.3.0',
    description: 'SEO and GEO audit council for hotel and hospitality websites',
    path: './presets/seo-hotel/seo-hotel.yml',
  },
  {
    name: 'ts-next-drizzle',
    version: '0.4.0',
    description: 'JS/TS modern stack preset (Next.js, Astro, Tailwind, Drizzle, Bun, Postgres)',
    path: './presets/ts-next-drizzle/ts-next-drizzle.yml',
  },
  {
    name: 'spring-kotlin-jpa',
    version: '0.4.0',
    description: 'Spring Boot Kotlin/JPA stack preset (Spring Boot, Kotlin/Java, Gradle, JPA, Hibernate)',
    path: './presets/spring-kotlin-jpa/spring-kotlin-jpa.yml',
  },
  {
    name: 'laravel-tall',
    version: '0.4.0',
    description: 'Laravel TALL stack preset (Laravel, Blade, Livewire, Alpine.js)',
    path: './presets/laravel-tall/laravel-tall.yml',
  },
  {
    name: 'python-data-api',
    version: '0.4.0',
    description: 'Python data/API stack preset (Python, FastAPI, Django, uv)',
    path: './presets/python-data-api/python-data-api.yml',
  },
];

/**
 * Get preset by name
 */
export function getPreset(name: string): PresetInfo | undefined {
  return PRESETS.find((p) => p.name === name);
}

/**
 * List all available presets
 */
export function listPresets(): PresetInfo[] {
  return [...PRESETS];
}
