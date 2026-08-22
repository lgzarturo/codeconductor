import { join } from 'node:path';
import {
  OutputPathError,
  preflightContainedOutput,
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

  const defaultMarkdownPath =
    output === undefined && format === 'markdown'
      ? join(
          'seo-reports',
          `audit-report-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`,
        )
      : undefined;
  const outputPathToWrite = output ?? defaultMarkdownPath;

  // Rejected before any network work so a bad/protected/existing path costs nothing.
  if (outputPathToWrite !== undefined) {
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
          command: 'seo audit',
          errors: [preflightError],
        },
      };
    }
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

    if (outputPathToWrite !== undefined) {
      outputFile = await writeContainedFile(
        options.projectRoot,
        outputPathToWrite,
        formattedOutput,
        { force },
      );
      if (defaultMarkdownPath !== undefined) {
        process.stderr.write(`Report saved to: ${outputFile}\n`);
      }
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
    // A refused output is a controlled outcome, not an audit failure: the
    // preflight already returns 1, and a path that only went bad in the race
    // window has to land on the same code.
    return {
      code: error instanceof OutputPathError ? 1 : 3,
      data: {
        success: false,
        command: 'seo audit',
        errors: [String(error)],
      },
    };
  }
}
