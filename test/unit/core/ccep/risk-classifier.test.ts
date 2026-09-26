import { describe, expect, test } from 'bun:test';
import { classifyRisk } from '../../../../src/core/ccep/risk-classifier';

describe('core/ccep/risk-classifier', () => {
  describe('classifyRisk — HIGH_RE signals', () => {
    const highSignalFiles: readonly string[] = [
      'src/db/migrations/001.sql',
      'prisma/schema.prisma',
      'src/auth/login.ts',
      'src/authn/session.ts',
      'src/authz/policy.ts',
      'src/oauth/callback.ts',
      'src/payment/charge.ts',
      'src/billing/invoice.ts',
      'config/credential-store.ts',
      'src/password/reset.ts',
      'src/secret/vault.ts',
      'openapi.yaml',
      'src/public-api/router.ts',
      'src/api-contract/v2.ts',
    ];

    for (const file of highSignalFiles) {
      test(`"${file}" classifies as high`, () => {
        expect(classifyRisk({ type: 'feature', targetFiles: [file] })).toBe('high');
      });
    }
  });

  describe('classifyRisk — infrastructure and supply-chain signals (INFRA_RE)', () => {
    const infraSignalFiles: readonly string[] = [
      'alembic/versions/0001_initial.py',
      '.github/workflows/ci.yml',
      'Dockerfile',
      'infra/terraform/main.tf',
      'infra/main.tf',
      'package-lock.json',
      'go.sum',
      'Cargo.lock',
    ];

    for (const file of infraSignalFiles) {
      test(`"${file}" classifies as high`, () => {
        expect(classifyRisk({ type: 'feature', targetFiles: [file] })).toBe('high');
      });
    }
  });

  describe('classifyRisk — type-based rules', () => {
    test('db-migration type is high', () => {
      expect(classifyRisk({ type: 'db-migration', targetFiles: ['README.md'] })).toBe('high');
    });

    test('api-contract type is high', () => {
      expect(classifyRisk({ type: 'api-contract', targetFiles: ['README.md'] })).toBe('high');
    });

    test('docs type is low', () => {
      expect(classifyRisk({ type: 'docs', targetFiles: ['README.md'] })).toBe('low');
    });

    test('review type is low', () => {
      expect(classifyRisk({ type: 'review' })).toBe('low');
    });

    test('test type is low', () => {
      expect(classifyRisk({ type: 'test' })).toBe('low');
    });

    test('refactor with a full-test-coverage signal is low', () => {
      expect(classifyRisk({ type: 'refactor', signals: ['full test coverage'] })).toBe('low');
    });

    test('refactor without a full-test-coverage signal is medium', () => {
      expect(classifyRisk({ type: 'refactor', signals: ['partial coverage'] })).toBe('medium');
    });

    test('fix with an isolated signal is low', () => {
      expect(classifyRisk({ type: 'fix', signals: ['isolated to one component'] })).toBe('low');
    });

    test('fix without an isolated signal is medium', () => {
      expect(classifyRisk({ type: 'fix', signals: ['affects several modules'] })).toBe('medium');
    });

    test('an unrecognized type with no signals defaults to medium', () => {
      expect(classifyRisk({ type: 'feature' })).toBe('medium');
    });
  });

  describe('classifyRisk — priority does not override signal-based classification', () => {
    test('a P0 priority signal alone does not force high risk', () => {
      expect(
        classifyRisk({ type: 'feature', targetFiles: ['src/loyalty.ts'], signals: ['P0'] }),
      ).toBe('medium');
    });
  });
});
