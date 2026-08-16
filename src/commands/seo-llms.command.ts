import {
  resolveOutputWithinRoot,
  writeContainedFile,
} from '../core/filesystem/path-containment';
import { generateLlmsTxtFromSitemap, generateLlmsTxtFromUrl } from '../domain/seo/llms-generator';
import type { SeoLlmsOptions } from '../domain/seo/seo-types';

export async function seoLlmsCommand(
  options: SeoLlmsOptions
): Promise<{ code: number; data?: unknown }> {
  const { url, sitemap, output, delay, force } = options;

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

  // Rejected before any network work so an escaping path costs nothing.
  if (
    output !== undefined &&
    (await resolveOutputWithinRoot(options.projectRoot, output)) === undefined
  ) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'seo llms',
        errors: [`Invalid --output path: ${output}. It must be relative to the project root.`],
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

    const outputPath = await writeContainedFile(
      options.projectRoot,
      output ?? 'llms.txt',
      result.content,
      { force },
    );

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
