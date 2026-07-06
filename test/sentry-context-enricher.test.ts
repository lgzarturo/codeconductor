import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import {
  enrichFromSentryIssue,
  processSentryWebhook,
  verifySentrySignature,
  type SentryIssueContext,
} from '../src/core/sentry/sentry-context-enricher';
import type { SentryWebhookPayload } from '../src/core/sentry/sentry-context-enricher';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const VALID_ISSUE: SentryIssueContext = {
  issueId: 'SENTRY-123',
  title: 'TypeError: Cannot read property "id" of undefined',
  culprit: 'UserService.findById (src/services/user.ts:42)',
  filename: 'src/services/user.ts',
  stackTrace: [
    {
      filename: 'src/services/user.ts',
      function: 'UserService.findById',
      lineNo: 42,
      colNo: 15,
      context: ['const user = await db.users.find(id);', 'return user.id;'],
    },
    {
      filename: 'src/controllers/auth.ts',
      function: 'AuthController.login',
      lineNo: 18,
      context: ['const user = await userService.findById(req.body.userId);'],
    },
  ],
  environment: 'production',
  release: '1.2.3',
};

const VALID_PAYLOAD: SentryWebhookPayload = {
  issueId: 'SENTRY-456',
  title: 'Payment processing failed',
  culprit: 'PaymentGateway.charge (src/payments/gateway.ts:88)',
  filename: 'src/payments/gateway.ts',
  stackTrace: [
    {
      filename: 'src/payments/gateway.ts',
      function: 'PaymentGateway.charge',
      lineNo: 88,
      context: ['await stripe.charges.create(amount);'],
    },
  ],
  environment: 'staging',
  release: '2.0.0',
};

const INVALID_PAYLOAD = {
  issueId: 123, // should be string
  title: null,
  stackTrace: 'not-an-array',
};

const SECRET = 'test-webhook-secret';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

function bodyOf(payload: SentryWebhookPayload): string {
  return JSON.stringify(payload);
}

// ─── enrichFromSentryIssue ──────────────────────────────────────────────────

describe('enrichFromSentryIssue', () => {
  test('maps title correctly', () => {
    const result = enrichFromSentryIssue(VALID_ISSUE);
    expect(result.Title).toBe('TypeError: Cannot read property "id" of undefined');
  });

  test('sets Type to fix', () => {
    const result = enrichFromSentryIssue(VALID_ISSUE);
    expect(result.Type).toBe('fix');
  });

  test('uses filename as Scope when present', () => {
    const result = enrichFromSentryIssue(VALID_ISSUE);
    expect(result.Scope).toBe('src/services/user.ts');
  });

  test('falls back to culprit as Scope when filename is absent', () => {
    const issue = { ...VALID_ISSUE, filename: undefined };
    const result = enrichFromSentryIssue(issue);
    expect(result.Scope).toBe('UserService.findById (src/services/user.ts:42)');
  });

  test('includes issue ID in Context', () => {
    const result = enrichFromSentryIssue(VALID_ISSUE);
    expect(result.Context).toContain('Sentry Issue: SENTRY-123');
  });

  test('includes environment in Context when present', () => {
    const result = enrichFromSentryIssue(VALID_ISSUE);
    expect(result.Context).toContain('Environment: production');
  });

  test('excludes environment from Context when absent', () => {
    const issue = { ...VALID_ISSUE, environment: undefined };
    const result = enrichFromSentryIssue(issue);
    expect(result.Context).not.toContain('Environment:');
  });

  test('includes release in Context when present', () => {
    const result = enrichFromSentryIssue(VALID_ISSUE);
    expect(result.Context).toContain('Release: 1.2.3');
  });

  test('formats stack trace with function name, file, and line', () => {
    const result = enrichFromSentryIssue(VALID_ISSUE);
    expect(result.Context).toContain('at UserService.findById (src/services/user.ts:42:15)');
    expect(result.Context).toContain('at AuthController.login (src/controllers/auth.ts:18)');
  });

  test('handles empty stack trace', () => {
    const issue = { ...VALID_ISSUE, stackTrace: [] };
    const result = enrichFromSentryIssue(issue);
    expect(result.Context).toContain('No stack trace available');
  });

  test('infers high risk for auth-related issues', () => {
    const issue: SentryIssueContext = {
      ...VALID_ISSUE,
      title: 'Auth token validation failed',
    };
    const result = enrichFromSentryIssue(issue);
    expect(result.Risk).toBe('high');
  });

  test('infers low risk when no risk keywords match', () => {
    const issue: SentryIssueContext = {
      ...VALID_ISSUE,
      title: 'Rendering error on homepage',
      culprit: 'HomePage.render (src/views/home.tsx:12)',
      filename: 'src/views/home.tsx',
    };
    const result = enrichFromSentryIssue(issue);
    expect(result.Risk).toBe('low');
  });

  test('infers medium risk for database issues', () => {
    const issue: SentryIssueContext = {
      ...VALID_ISSUE,
      title: 'Database connection timeout',
    };
    const result = enrichFromSentryIssue(issue);
    expect(result.Risk).toBe('medium');
  });

  test('infers high risk from culprit containing security', () => {
    const issue: SentryIssueContext = {
      ...VALID_ISSUE,
      title: 'Something broke',
      culprit: 'SecurityMiddleware.check (src/security/middleware.ts:10)',
    };
    const result = enrichFromSentryIssue(issue);
    expect(result.Risk).toBe('high');
  });

  test('infers low risk for unrelated issues', () => {
    const issue: SentryIssueContext = {
      ...VALID_ISSUE,
      title: 'Widget rendering glitch',
      culprit: 'Widget.render (src/widgets/widget.ts:5)',
      filename: 'src/widgets/widget.ts',
    };
    const result = enrichFromSentryIssue(issue);
    expect(result.Risk).toBe('low');
  });
});

// ─── processSentryWebhook ───────────────────────────────────────────────────

describe('processSentryWebhook', () => {
  test('returns enrichment for valid payload with valid signature', () => {
    const body = bodyOf(VALID_PAYLOAD);
    const result = processSentryWebhook(body, sign(body), { secret: SECRET });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.Title).toBe(VALID_PAYLOAD.title);
      expect(result.data.Type).toBe('fix');
      expect(result.data.Scope).toBe('src/payments/gateway.ts');
    }
  });

  test('returns validation error for invalid payload', () => {
    const body = JSON.stringify(INVALID_PAYLOAD);
    const result = processSentryWebhook(body, sign(body), { secret: SECRET });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('validation');
      expect(result.error.message).toBe('Invalid Sentry webhook payload');
    }
  });

  test('returns validation error for completely wrong shape', () => {
    const body = JSON.stringify({ foo: 'bar' });
    const result = processSentryWebhook(body, sign(body), { secret: SECRET });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('validation');
    }
  });

  test('returns validation error for invalid JSON', () => {
    const result = processSentryWebhook('not-json', undefined, {
      skipSignatureVerification: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('validation');
      expect(result.error.message).toContain('Invalid JSON');
    }
  });

  test('returns signature error when verification enabled without secret', () => {
    const body = bodyOf(VALID_PAYLOAD);
    const result = processSentryWebhook(body, sign(body), {
      skipSignatureVerification: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('signature');
      expect(result.error.message).toContain('no secret provided');
    }
  });

  test('returns signature error when signature header is missing', () => {
    const body = bodyOf(VALID_PAYLOAD);
    const result = processSentryWebhook(body, undefined, { secret: SECRET });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('signature');
      expect(result.error.message).toContain('missing');
    }
  });

  test('returns signature error for invalid signature', () => {
    const body = bodyOf(VALID_PAYLOAD);
    const result = processSentryWebhook(body, 'deadbeef', { secret: SECRET });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('signature');
      expect(result.error.message).toContain('failed');
    }
  });

  test('returns signature error for wrong secret', () => {
    const body = bodyOf(VALID_PAYLOAD);
    const wrongSig = createHmac('sha256', 'wrong-secret').update(body).digest('hex');
    const result = processSentryWebhook(body, wrongSig, { secret: SECRET });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('signature');
    }
  });

  test('does not crash on non-hex signature (C2 guard)', () => {
    const body = bodyOf(VALID_PAYLOAD);
    // "not-hex-at-all!!!" contains non-hex characters
    const result = processSentryWebhook(body, 'sha256=not-hex-at-all!!!', { secret: SECRET });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('signature');
    }
  });

  test('accepts sha256= prefixed valid signature', () => {
    const body = bodyOf(VALID_PAYLOAD);
    const hex = sign(body);
    const result = processSentryWebhook(body, `sha256=${hex}`, { secret: SECRET });
    expect(result.success).toBe(true);
  });

  test('skipSignatureVerification bypasses verification', () => {
    const body = bodyOf(VALID_PAYLOAD);
    const result = processSentryWebhook(body, undefined, {
      skipSignatureVerification: true,
    });
    expect(result.success).toBe(true);
  });

  test('returns error for null input', () => {
    const result = processSentryWebhook('null', undefined, {
      skipSignatureVerification: true,
    });
    expect(result.success).toBe(false);
  });

  test('returns error for array input', () => {
    const result = processSentryWebhook('[1, 2, 3]', undefined, {
      skipSignatureVerification: true,
    });
    expect(result.success).toBe(false);
  });
});

// ─── verifySentrySignature ──────────────────────────────────────────────────

describe('verifySentrySignature', () => {
  const body = '{"issueId":"123","title":"test"}';

  test('returns true for valid signature', () => {
    const signature = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySentrySignature(body, signature, SECRET)).toBe(true);
  });

  test('returns true for sha256= prefixed signature', () => {
    const hex = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySentrySignature(body, `sha256=${hex}`, SECRET)).toBe(true);
  });

  test('returns false for incorrect signature', () => {
    expect(verifySentrySignature(body, 'deadbeef', SECRET)).toBe(false);
  });

  test('returns false for wrong secret', () => {
    const signature = createHmac('sha256', 'wrong-secret').update(body).digest('hex');
    expect(verifySentrySignature(body, signature, SECRET)).toBe(false);
  });

  test('returns false for tampered body', () => {
    const signature = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySentrySignature(body + '!', signature, SECRET)).toBe(false);
  });

  test('returns false for empty signature', () => {
    expect(verifySentrySignature(body, '', SECRET)).toBe(false);
  });

  test('does not crash on non-hex signature', () => {
    expect(verifySentrySignature(body, 'not-hex!!!', SECRET)).toBe(false);
  });
});
