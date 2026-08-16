import { join } from 'node:path';
import {
  resolveOutputWithinRoot,
  writeContainedFile,
} from '../core/filesystem/path-containment';
import { auditSitemap, auditUrl } from '../domain/seo/seo-auditor';
import { formatCli, formatJson, formatMarkdown, computeExitCode } from '../domain/seo/report-formatter';
import type { SeoAuditOptions } from '../domain/seo/seo-types';

export async function seoAuditCommand(
  options: SeoAuditOptions
): Promise<{ code: number; data?: unknown }> {
  const { url, sitemap, format, failOn, delay, output, followRedirects, force } = options;

  if (!url && !sitemap) {
    return {
      code: 1,
      data: {
        success: false,
        command: 'seo audit',
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
        command: 'seo audit',
        errors: [`Invalid --output path: ${output}. It must be relative to the project root.`],
      },
    };
  }

  try {
    const report = sitemap
      ? await auditSitemap(sitemap, {
          delay,
          followRedirects,
          onProgress: format === 'cli' ? (current, total, pageUrl) => {
            process.stderr.write(`\r  Auditing ${current}/${total}: ${pageUrl}`);
          } : undefined,
        })
      : await auditUrl(url!, { followRedirects });

    if (format === 'cli') {
      process.stderr.write('\r' + ' '.repeat(80) + '\r');
    }

    let formattedOutput: string;
    switch (format) {
      case 'json':
        formattedOutput = formatJson(report);
        break;
      case 'markdown':
        formattedOutput = formatMarkdown(report);
        break;
      default:
        formattedOutput = formatCli(report);
    }

    let outputFile: string | undefined;

    if (output) {
      outputFile = await writeContainedFile(options.projectRoot, output, formattedOutput, { force });
    } else if (format === 'markdown') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultPath = join('seo-reports', `audit-report-${timestamp}.md`);
      outputFile = await writeContainedFile(options.projectRoot, defaultPath, formattedOutput, {
        force,
      });
      process.stderr.write(`Report saved to: ${outputFile}\n`);
    }

    const exitCode = computeExitCode(report, failOn);

    return {
      code: exitCode,
      data: {
        success: true,
        command: 'seo audit',
        report,
        output: formattedOutput,
        outputFile,
      },
    };
  } catch (error) {
    return {
      code: 3,
      data: {
        success: false,
        command: 'seo audit',
        errors: [String(error)],
      },
    };
  }
}
