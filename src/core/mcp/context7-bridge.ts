import { z } from 'zod';
import { ok, err, type Result } from '../../utils/result';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const Context7LibrarySchema = z.object({
  libraryId: z.string(),
  name: z.string(),
  description: z.string(),
  codeSnippets: z.number(),
  sourceReputation: z.enum(['High', 'Medium', 'Low', 'Unknown']),
  benchmarkScore: z.number(),
  versions: z.array(z.string()),
});

export type Context7Library = z.infer<typeof Context7LibrarySchema>;

// ─── Doc Result ───────────────────────────────────────────────────────────────

export const Context7DocResultSchema = z.object({
  libraryId: z.string(),
  query: z.string(),
  content: z.string(),
  sourceUrl: z.string().optional(),
});

export type Context7DocResult = z.infer<typeof Context7DocResultSchema>;

// ─── Error ────────────────────────────────────────────────────────────────────

export class Context7Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'Context7Error';
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface Context7BridgeConfig {
  apiKey?: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.context7.com/v1';

// ─── Internal API types ───────────────────────────────────────────────────────

interface ResolveLibraryIdRequest {
  query: string;
  libraryName: string;
}

interface ResolveLibraryIdResponse {
  libraries: Context7Library[];
}

interface QueryDocsRequest {
  libraryId: string;
  query: string;
}

type QueryDocsResponse = z.infer<typeof Context7DocResultSchema>;

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createContext7Bridge(config: Context7BridgeConfig = {}) {
  const apiKey = config.apiKey ?? process.env.CONTEXT7_API_KEY;
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new Context7Error(
      'CONTEXT7_API_KEY is required. Set it in environment or pass via config.',
      'MISSING_API_KEY',
    );
  }

  async function request<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Context7Error(
        `Context7 API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
        'API_ERROR',
      );
    }

    const data = await response.json();
    return data as T;
  }

  async function resolveLibraryId(
    query: string,
    libraryName: string,
  ): Promise<Result<Context7Library[], Context7Error>> {
    try {
      const res = await request<ResolveLibraryIdResponse>('/resolve-library-id', {
        query,
        libraryName,
      });
      const libraries = res.libraries.map((lib) => Context7LibrarySchema.parse(lib));
      return ok(libraries);
    } catch (error) {
      if (error instanceof Context7Error) return err(error);
      if (error instanceof z.ZodError) {
        return err(
          new Context7Error(
            `Invalid response schema: ${error.message}`,
            'SCHEMA_ERROR',
            error,
          ),
        );
      }
      return err(
        new Context7Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
          'NETWORK_ERROR',
          error,
        ),
      );
    }
  }

  async function queryDocs(
    libraryId: string,
    query: string,
  ): Promise<Result<Context7DocResult, Context7Error>> {
    try {
      const res = await request<QueryDocsResponse>('/query-docs', {
        libraryId,
        query,
      });
      const result = Context7DocResultSchema.parse(res);
      return ok(result);
    } catch (error) {
      if (error instanceof Context7Error) return err(error);
      if (error instanceof z.ZodError) {
        return err(
          new Context7Error(
            `Invalid response schema: ${error.message}`,
            'SCHEMA_ERROR',
            error,
          ),
        );
      }
      return err(
        new Context7Error(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
          'NETWORK_ERROR',
          error,
        ),
      );
    }
  }

  return { resolveLibraryId, queryDocs };
}
