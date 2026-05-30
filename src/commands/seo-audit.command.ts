import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { auditSitemap, auditUrl } from '../domain/seo/seo-auditor';
import { formatCli, formatJson, formatMarkdown, computeExitCode } from '../domain/seo/report-formatter';
import type { SeoAuditOptions } from '../domain/seo/seo-types';

export async function seoAuditCommand(
  options: SeoAuditOptions
): Promise<{ code: number; data?: unknown }> {
  const { url, sitemap, format, failOn, delay, output, followRedirects } = options;

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

    if (output) {
      const outputPath = resolve(options.projectRoot, output);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, formattedOutput, 'utf-8');
    } else if (format === 'markdown') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultPath = resolve(options.projectRoot, 'seo-reports', `audit-report-${timestamp}.md`);
      await mkdir(dirname(defaultPath), { recursive: true });
      await writeFile(defaultPath, formattedOutput, 'utf-8');
      process.stderr.write(`Report saved to: ${defaultPath}\n`);
    }

    const exitCode = computeExitCode(report, failOn);

    return {
      code: exitCode,
      data: {
        success: true,
        command: 'seo audit',
        report,
        output: formattedOutput,
        outputFile: output
          ? resolve(options.projectRoot, output)
          : format === 'markdown'
            ? resolve(options.projectRoot, 'seo-reports')
            : undefined,
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
