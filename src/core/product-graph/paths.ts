import { join } from 'node:path';

export const PRODUCT_DIR = '.codeconductor';

export const PRODUCT_GRAPH_FILE = 'product-graph.json';
export const PRODUCT_META_FILE = 'product-meta.json';
export const EVENTS_FILE = 'events.jsonl';
export const OPERATIONAL_STATE_FILE = 'operational-state.json';
export const STRATEGIC_FILE = 'strategic.json';
export const PRODUCT_REPORT_FILE = 'product-report.md';
export const FEEDBACK_SOURCES_FILE = 'feedback-sources.yml';
export const DECISIONS_DIR = 'decisions';
export const EVIDENCE_DIR = 'evidence';

export function productGraphPath(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, PRODUCT_GRAPH_FILE);
}

export function productMetaPath(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, PRODUCT_META_FILE);
}

export function eventsPath(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, EVENTS_FILE);
}

export function operationalStatePath(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, OPERATIONAL_STATE_FILE);
}

export function strategicPath(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, STRATEGIC_FILE);
}

export function productReportPath(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, PRODUCT_REPORT_FILE);
}

export function decisionsDir(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, DECISIONS_DIR);
}

export function evidenceDir(projectRoot: string): string {
  return join(projectRoot, PRODUCT_DIR, EVIDENCE_DIR);
}
