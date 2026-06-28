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

export const COMMIT_STYLE: Record<SupportedLocale, string> = {
  en: `---
trigger: always_on
description: Rules for generating commit messages using Conventional Commits format
---

## Git Commit Messages

### Format

\`\`\`
<type>(<scope>): <short description>

- <detail 1>
- <detail 2>
\`\`\`

### Valid Types

\`feat\` \`fix\` \`docs\` \`style\` \`refactor\` \`test\` \`chore\` \`perf\` \`ci\` \`build\`
\`revert\`

### Rules

- Language: **neutral English** always
- Header: maximum 69 characters, no trailing period
- Body: concise bullet points, one idea per line
- Footer: only for breaking changes or issues
- No gerunds ("adding", "fixing")
- Use infinitive or imperative ("add", "fix", "update")`,

  es: `---
trigger: always_on
description: Reglas para generar mensajes de commit con formato Conventional Commits
---

## Git Commit Messages

### Formato

\`\`\`
<tipo>(<scope>): <descripcion corta>

- <detalle 1>
- <detalle 2>
\`\`\`

### Tipos validos

\`feat\` \`fix\` \`docs\` \`style\` \`refactor\` \`test\` \`chore\` \`perf\` \`ci\` \`build\`
\`revert\`

### Reglas

- Idioma: **español neutro** siempre
- Encabezado: maximo 69 caracteres, sin punto final
- Cuerpo: viñetas concisas, una idea por linea
- Footer: solo para breaking changes o issues
- Sin gerundios ("agregando", "corrigiendo")
- Usar infinitivo o imperativo ("agregar", "corregir", "actualizar")`
};

export const COMMIT_WORKFLOW: Record<SupportedLocale, string> = {
  en: `---
name: commit
description: Generates a commit in English following Conventional Commits based on staged changes
---

// turbo-all

## Steps

1. View staged changes: \`git diff --cached --stat\`
2. If nothing is staged, suggest \`git add .\` or specific files
3. Get full diff: \`git diff --cached\`
4. Check recent style: \`git log -n 3 --oneline\`
5. Generate message following \`.agents/rules/commit-style.md\`
6. Show proposal and confirm with the user
7. Execute: \`git commit -m "<message>"\`
8. Confirm success: \`git status\``,

  es: `---
name: commit
description: Genera un commit en español siguiendo Conventional Commits basado en los cambios staged
---

// turbo-all

## Pasos

1. Ver cambios staged: \`git diff --cached --stat\`
2. Si no hay nada staged, sugiere \`git add .\` o archivos específicos
3. Obtener diff completo: \`git diff --cached\`
4. Ver estilo reciente: \`git log -n 3 --oneline\`
5. Generar mensaje siguiendo \`.agents/rules/commit-style.md\`
6. Mostrar propuesta y confirmar con el usuario
7. Ejecutar: \`git commit -m "<mensaje>"\`
8. Confirmar éxito: \`git status\``
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
