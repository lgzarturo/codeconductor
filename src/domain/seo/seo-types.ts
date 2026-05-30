export interface SitemapEntry {
  readonly url: string;
  readonly lastmod?: string;
  readonly changefreq?: string;
  readonly priority?: string;
}

export interface SitemapParseResult {
  readonly entries: SitemapEntry[];
  readonly type: 'urlset' | 'sitemapindex';
  readonly childSitemaps: string[];
}

export interface SafeFetchOptions {
  readonly timeout?: number;
  readonly followRedirects?: boolean;
  readonly delay?: number;
}

export interface SafeFetchResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly responseTime: number;
  readonly url: string;
}

export type Severity = 'error' | 'warning' | 'info' | 'pass';

export interface AuditCheck {
  readonly name: string;
  readonly category: string;
  readonly severity: Severity;
  readonly message: string;
  readonly remediation?: string;
}

export interface PageAuditResult {
  readonly url: string;
  readonly checks: AuditCheck[];
  readonly responseTime: number;
}

export interface AuditSummary {
  readonly total: number;
  readonly passed: number;
  readonly warnings: number;
  readonly errors: number;
  readonly score: number;
}

export interface AuditReport {
  readonly target: string;
  readonly timestamp: string;
  readonly pages: PageAuditResult[];
  readonly summary: AuditSummary;
}

export interface JsonLdBlock {
  readonly type: string;
  readonly properties: Record<string, unknown>;
  readonly raw: string;
}

export interface SchemaValidationResult {
  readonly valid: boolean;
  readonly type: string;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface LlmsTxtEntry {
  readonly title: string;
  readonly url: string;
  readonly description: string;
}

export interface LlmsTxtResult {
  readonly content: string;
  readonly entries: LlmsTxtEntry[];
}

export interface SeoAuditOptions {
  readonly url?: string;
  readonly sitemap?: string;
  readonly format: 'cli' | 'json' | 'markdown';
  readonly failOn: 'error' | 'warning';
  readonly delay: number;
  readonly output?: string;
  readonly followRedirects: boolean;
  readonly projectRoot: string;
}

export interface SeoLlmsOptions {
  readonly url?: string;
  readonly sitemap?: string;
  readonly output?: string;
  readonly delay: number;
  readonly projectRoot: string;
}
