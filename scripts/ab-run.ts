#!/usr/bin/env bun
/**
 * T-034: A/B sin-arnés vs con-arnés.
 *
 *   bun run ab:run -- --provider free|deepseek [--dry-run] [--out DIR] [--model ID]
 *
 * Live spends OpenRouter requests — Arturo runs that locally. CI uses --dry-run.
 */
import { runAb } from '../src/core/evaluation/ab/run';

function usage(): never {
  console.error(`Usage: bun run ab:run -- --provider free|deepseek [options]

Options:
  --provider free|deepseek   Model family + request cap (500 free / 300 deepseek)
  --model <id>               Override model id
  --out <dir>                Report dir (default ~/.cache/codeconductor-ab/)
  --dry-run                  No network: prove harness loads on con-arnés only
  --n <int>                  Repetitions per task × arm (default 5)
  --max-turns <int>          Claude maxTurns (minimum 6)
  --seed <int>               Schedule seed (default 42)

Keys: OPENROUTER_API_KEY (required for live). Never printed.
`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) usage();

  const provider = flagValue(args, '--provider');
  if (!provider) usage();

  const result = await runAb({
    provider,
    model: flagValue(args, '--model'),
    out: flagValue(args, '--out'),
    dryRun: args.includes('--dry-run'),
    n: flagValue(args, '--n') ? Number(flagValue(args, '--n')) : undefined,
    maxTurns: flagValue(args, '--max-turns')
      ? Number(flagValue(args, '--max-turns'))
      : undefined,
    seed: flagValue(args, '--seed') ? Number(flagValue(args, '--seed')) : undefined,
    projectRoot: process.cwd(),
  });

  for (const line of result.dryRunMessages) {
    console.log(line);
  }
  if (result.reportPaths) {
    console.log(`report_json=${result.reportPaths.jsonPath}`);
    console.log(`report_md=${result.reportPaths.mdPath}`);
  }
  if (result.report) {
    console.log(`verdict=${result.report.verdict}`);
    if (result.report.capReached) console.log('tope alcanzado');
  }
  if (result.error) {
    console.error(result.error);
  }
  process.exit(result.code);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
