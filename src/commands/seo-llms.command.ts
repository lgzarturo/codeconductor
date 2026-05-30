import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generateLlmsTxtFromSitemap, generateLlmsTxtFromUrl } from '../domain/seo/llms-generator';
import type { SeoLlmsOptions } from '../domain/seo/seo-types';

export async function seoLlmsCommand(
  options: SeoLlmsOptions
): Promise<{ code: number; data?: unknown }> {
  const { url, sitemap, output, delay } = options;

  if (!url && !sitemap) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'seo llms',
        errors: ['Either --url or --sitemap is required'],
      },
    };
  }

  try {
    const result = sitemap
      ? await generateLlmsTxtFromSitemap(sitemap, {
          delay,
          onProgress: (current, total, pageUrl) => {
            process.stderr.write(`\r  Processing ${current}/${total}: ${pageUrl}`);
          },
        })
      : await generateLlmsTxtFromUrl(url!);

    process.stderr.write('\r' + ' '.repeat(80) + '\r');

    const outputPath = output
      ? resolve(options.projectRoot, output)
      : resolve(options.projectRoot, 'llms.txt');

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, result.content, 'utf-8');

    process.stderr.write(`Generated: ${outputPath} (${result.entries.length} entries)\n`);

    return {
      code: 0,
      data: {
        success: true,
        command: 'seo llms',
        outputFile: outputPath,
        entries: result.entries.length,
        content: result.content,
      },
    };
  } catch (error) {
    return {
      code: 3,
      data: {
        success: false,
        command: 'seo llms',
        errors: [String(error)],
      },
    };
  }
}
