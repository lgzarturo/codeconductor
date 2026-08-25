/**
 * Simple template renderer with variable substitution
 */
export interface TemplateData {
  [key: string]: string | string[] | number | boolean | undefined;
}

/**
 * Render a template with data
 */
export function renderTemplate(template: string, data: TemplateData): string {
  let result = template;

  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    const replacement = Array.isArray(value)
      ? value.join(', ')
      : value !== undefined
        ? String(value)
        : undefined;
    if (replacement === undefined) continue;
    result = result.split(placeholder).join(replacement);
  }

  return result;
}

/**
 * Render a list of templates
 */
export function renderTemplates(templates: string[], data: TemplateData): string[] {
  return templates.map((t) => renderTemplate(t, data));
}
