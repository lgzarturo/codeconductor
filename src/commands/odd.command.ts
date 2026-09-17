import { loadMemoryIndex } from '../core/memory/memory-index';
import { resumeDecision } from '../core/ccep/context-assembly';
import { validateTaskCardForProfile } from '../core/ccep/task-card-validator';
import { loadWorkflowProfile } from '../core/ccep/workflow-profile-loader';
import {
  createDeliveryLedger,
  loadDeliveryLedger,
  reconcileDeliveryLedger,
} from '../core/delivery/delivery-ledger';
import { DeliveryLedgerRequestSchema } from '../validation/schemas';

export interface OddOptions {
  readonly subcommand: string;
  readonly projectRoot: string;
  readonly input?: unknown;
  readonly id?: string;
}

export async function oddCommand(options: OddOptions): Promise<{ code: number; data?: unknown }> {
  if (options.subcommand === 'create') {
    let input = options.input;
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input);
      } catch {
        return { code: 1, data: { success: false, errors: ['Invalid JSON input'] } };
      }
    }
    const request = DeliveryLedgerRequestSchema.safeParse(input);
    if (!request.success) return { code: 1, data: { success: false, errors: request.error.issues } };
    if (!request.data.authorized || request.data.route !== 'tracked') {
      return { code: 0, data: { success: true, created: false, reason: 'route_not_tracked' } };
    }
    const issues = validateTaskCardForProfile(
      loadWorkflowProfile('odd', options.projectRoot),
      request.data.taskCard,
    );
    if (issues.length > 0) return { code: 1, data: { success: false, errors: issues } };
    try {
      const result = await createDeliveryLedger(options.projectRoot, request.data);
      return { code: 0, data: { success: true, ...result, ...(result.created ? {} : { existing: true }) } };
    } catch (error) {
      return { code: 1, data: { success: false, errors: [String(error)] } };
    }
  }

  if (!options.id) return { code: 1, data: { success: false, errors: ['Missing ledger id'] } };
  try {
    if (options.subcommand === 'read') {
      return { code: 0, data: { success: true, ledger: await loadDeliveryLedger(options.projectRoot, options.id) } };
    }
    if (options.subcommand === 'reconcile') {
      const result = await reconcileDeliveryLedger(options.projectRoot, options.id);
      const memory = await loadMemoryIndex(options.projectRoot);
      const { rddCommand } = await import('./rdd.command');
      const rdd = await rddCommand({
        subcommand: 'status',
        projectRoot: options.projectRoot,
        taskId: result.ledger.taskCard.id,
      });
      const receipts = (rdd.data as { receipts?: Array<{ valid?: boolean }> }).receipts ?? [];
      const staleReceipt = receipts.some((receipt) => receipt.valid === false);
      const changedPaths = staleReceipt
        ? [...result.changedPaths, 'RDD receipt'].sort()
        : result.changedPaths;
      return {
        code: 0,
        data: {
          success: true,
          status: changedPaths.length === 0 ? 'ready' : 'conflict',
          resume: resumeDecision(changedPaths),
          rdd,
          memory: memory.success ? 'available' : 'unavailable',
          memoryPointers: memory.success
            ? memory.data.pointers.filter((pointer) => pointer.topic_key === result.ledger.memoryTopicKey)
            : [],
          ...result,
          changedPaths,
        },
      };
    }
    return { code: 1, data: { success: false, errors: [`Unknown odd subcommand: ${options.subcommand}`] } };
  } catch (error) {
    return { code: 1, data: { success: false, errors: [String(error)] } };
  }
}
