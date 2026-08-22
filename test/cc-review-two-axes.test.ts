/**
 * Tests for BC-003: /cc:review two-axis code review (Standards + Spec).
 *
 * Validates that the Review workflow separates evaluation into two parallel
 * sub-agents executing Standards baseline (Fowler code smells + overrides) and
 * Spec alignment (Task Card / acceptance criteria / scope) without reranking
 * between them. Verdict is combined and recorded via `cc scorecard record`.
 *
 * NOTE: Tests assert against presets/claude/** (source of truth).
 * The .claude/ directory is bind-mounted read-only; presets/ is editable.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const PROJECT_ROOT = process.cwd();
const CLAUDE_MD = join(PROJECT_ROOT, 'presets', 'claude', 'CLAUDE.md');
const REVIEW_CMD = join(PROJECT_ROOT, 'presets', 'claude', 'commands', 'cc', 'review.md');

describe('BC-003: /cc:review two-axis parallel review (Standards + Spec)', () => {
  describe('Criterion 1: Standards and Spec axes executed as parallel sub-agents', () => {
    it('should have presets/claude/CLAUDE.md file', () => {
      expect(existsSync(CLAUDE_MD)).toBe(true);
    });

    it('should mention Standards and Spec axes in Reviewer role section', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      
      expect(reviewerSection).toBeDefined();
      // Standards axis
      expect(reviewerSection.toLowerCase()).toContain('standards');
      // Spec axis
      expect(reviewerSection.toLowerCase()).toContain('spec');
    });

    it('should mention parallel execution of sub-agents in Reviewer section', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      
      // Expect keywords for parallelization
      const lowerReviewer = reviewerSection.toLowerCase();
      const hasParallel = lowerReviewer.includes('parallel');
      const hasSubAgent = 
        lowerReviewer.includes('sub-agent') || 
        lowerReviewer.includes('subagent') ||
        lowerReviewer.includes('separate');
      
      expect(hasParallel || hasSubAgent).toBe(true);
    });

    it('should have presets/claude/commands/cc/review.md file', () => {
      expect(existsSync(REVIEW_CMD)).toBe(true);
    });

    it('should mention Standards and Spec axes in review command workflow', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      const lowerContent = content.toLowerCase();
      
      expect(lowerContent).toContain('standards');
      expect(lowerContent).toContain('spec');
    });

    it('should mention parallel execution in review command workflow', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      const lowerContent = content.toLowerCase();
      
      expect(lowerContent).toContain('parallel');
    });
  });

  describe('Criterion 2: Standards axis applies Fowler code smell baseline with documented override', () => {
    it('should mention Fowler in Reviewer role section', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      
      expect(reviewerSection).toContain('Fowler');
    });

    it('should mention code smell baseline in Reviewer role section', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      const lowerReviewer = reviewerSection.toLowerCase();
      
      expect(lowerReviewer).toContain('code smell');
    });

    it('should mention override mechanism for code smell baseline', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      const lowerReviewer = reviewerSection.toLowerCase();
      
      expect(lowerReviewer).toContain('override');
    });
  });

  describe('Criterion 3: Verdict recorded via scorecard with PASS|REVISE|REJECT values', () => {
    it('should reference scorecard record command in review workflow', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      
      expect(content).toContain('scorecard record');
    });

    it('should accept --verdict flag with PASS value', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      
      expect(content).toContain('--verdict PASS');
    });

    it('should accept --verdict flag with REVISE value', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      
      expect(content).toContain('--verdict REVISE');
    });

    it('should accept --verdict flag with REJECT value', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      
      expect(content).toContain('--verdict REJECT');
    });

    it('should have scorecard record command with full verdict signature', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      
      // Verify the exact format for scorecard integration
      expect(content).toContain('scorecard record --verdict PASS|REVISE|REJECT');
    });
  });

  describe('No-reranking rule: axes execute independently without reranking between them', () => {
    it('should document no reranking between Standards and Spec axes', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      const lowerReviewer = reviewerSection.toLowerCase();
      
      // Look for reranking related keywords (negative enforcement)
      const hasNoRerank = 
        lowerReviewer.includes('no rerank') ||
        lowerReviewer.includes('without reranking') ||
        lowerReviewer.includes('independent');
      
      expect(hasNoRerank).toBe(true);
    });

    it('should describe combined verdict as separate from individual axis judgments', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      const lowerReviewer = reviewerSection.toLowerCase();
      
      // Expect language about combining verdicts after parallel execution
      const hasCombined = lowerReviewer.includes('combined');
      
      expect(hasCombined).toBe(true);
    });
  });

  describe('Edge case: Repository structure robustness', () => {
    it('should not have malformed markdown in Reviewer section', () => {
      const content = readFileSync(CLAUDE_MD, 'utf-8');
      const reviewerSection = content.split('### Reviewer')[1];
      
      // Check for unclosed code blocks or malformed sections
      const openBackticks = (reviewerSection.match(/```/g) || []).length;
      expect(openBackticks % 2).toBe(0); // Even number = properly closed
    });

    it('should not have malformed markdown in review command file', () => {
      const content = readFileSync(REVIEW_CMD, 'utf-8');
      
      // Check for unclosed code blocks
      const openBackticks = (content.match(/```/g) || []).length;
      expect(openBackticks % 2).toBe(0); // Even number = properly closed
    });
  });
});
