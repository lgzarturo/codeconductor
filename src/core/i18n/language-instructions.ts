/**
 * Language instruction blocks injected into preset files at install time.
 *
 * Each locale maps to a single bullet-point instruction line that is
 * appended to the "Approach" section of CLAUDE.md, AGENTS.md, and README.md.
 *
 * Supported locales: 'en' (default) | 'es'
 */

export type SupportedLocale = 'en' | 'es';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'es'];

/**
 * Language instruction lines keyed by locale.
 * Each value is a single bullet-list item (no leading dash — the caller adds it).
 */
export const LANGUAGE_INSTRUCTIONS: Record<SupportedLocale, string> = {
  en: 'Prose/docs/code comments: be terse and direct. Prefer concrete nouns over abstract ones. Omit filler phrases ("note that", "please", "as mentioned"). One idea per sentence.',
  es: 'Spanish prose/docs/reports/Markdown: preserve natural Spanish orthography, including accents, `ñ`, `¿`, `¡`, and normal Unicode. The ASCII-only editing preference does not apply to these artifacts.',
};

/**
 * Returns the formatted bullet line for the given locale.
 * Falls back to 'en' if locale is not recognised.
 */
export function getLanguageInstruction(locale: string): string {
  const key = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as SupportedLocale)
    : 'en';
  return `- ${LANGUAGE_INSTRUCTIONS[key]}`;
}

/**
 * Template placeholder used in preset markdown files.
 * Replaced by getLanguageInstruction() during install.
 */
export const LOCALE_PLACEHOLDER = '{{LANGUAGE_INSTRUCTIONS}}';
