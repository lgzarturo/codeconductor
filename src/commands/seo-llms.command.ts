import {
  OutputPathError,
  preflightContainedOutput,
  writeContainedFile,
} from '../core/filesystem/path-containment';
import { generateLlmsTxtFromSitemap, generateLlmsTxtFromUrl } from '../domain/seo/llms-generator';
import type { SeoLlmsOptions } from '../domain/seo/seo-types';

export async function seoLlmsCommand(
  options: SeoLlmsOptions
): Promise<{ code: number; data?: unknown }> {
  const { url, sitemap, output, delay, force } = options;
  const outputPathToWrite = output ?? 'llms.txt';

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

  // Rejected before any network work so a bad/protected/existing path costs nothing.
  const preflightError = await preflightContainedOutput(
    options.projectRoot,
    outputPathToWrite,
    { force },
  );
  if (preflightError !== undefined) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'seo llms',
        errors: [preflightError],
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
      outputPathToWrite,
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
    // A refused output is a controlled outcome, not a generator failure: the
    // preflight already returns 1, and a path that only went bad in the race
    // window has to land on the same code.
    return {
      code: error instanceof OutputPathError ? 1 : 3,
      data: {
        success: false,
        command: 'seo llms',
        errors: [String(error)],
      },
    };
  }
}
