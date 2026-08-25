import { describe, expect, test } from 'bun:test';
import { renderTemplate } from '../src/core/generation/template-renderer';

describe('renderTemplate: split/join placeholders', () => {
  test('substitutes keys that contain regex metacharacters', () => {
    const template = 'a={{foo.bar}} b={{a+b}} c={{x*y}} d={{end$}}';
    const rendered = renderTemplate(template, {
      'foo.bar': 'dot',
      'a+b': 'plus',
      'x*y': 'star',
      end$: 'dollar',
    });
    expect(rendered).toBe('a=dot b=plus c=star d=dollar');
  });

  test('replaces every occurrence without treating the placeholder as a regex', () => {
    const rendered = renderTemplate('{{a+b}} and {{a+b}}', { 'a+b': 'ok' });
    expect(rendered).toBe('ok and ok');
  });
});
