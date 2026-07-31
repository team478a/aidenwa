import { spawnSync } from 'node:child_process';

const sourceDatabase = 'sales_ai_rehearsal_source';
const restoreDatabase = 'sales_ai_rehearsal_restore';
const backupPath = '/tmp/aidenwa-rehearsal.dump';
const baseDatabaseUrl = process.env.DATABASE_URL;

function fail(message: string): never {
  throw new Error(`database_rehearsal_failed: ${message}`);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', stdio: 'pipe', shell: false });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0)
    fail(`${command} ${args.join(' ')}\n${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

function dockerPostgres(args: string[]) {
  return run('docker', ['compose', 'exec', '-T', 'postgres', ...args]);
}

function isolatedUrl(databaseName: string) {
  if (!baseDatabaseUrl) fail('DATABASE_URL is required');
  const url = new URL(baseDatabaseUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    fail('only a local PostgreSQL host is allowed');
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function resetDatabase(databaseName: string) {
  if (![sourceDatabase, restoreDatabase].includes(databaseName)) fail('unsafe database target');
  dockerPostgres([
    'psql',
    '-U',
    'sales_ai',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
  ]);
  dockerPostgres(['createdb', '-U', 'sales_ai', databaseName]);
}

function dropDatabase(databaseName: string) {
  if (![sourceDatabase, restoreDatabase].includes(databaseName)) fail('unsafe database target');
  dockerPostgres(['dropdb', '-U', 'sales_ai', '--if-exists', '--force', databaseName]);
}

function migrationCount(databaseName: string) {
  return dockerPostgres([
    'psql',
    '-U',
    'sales_ai',
    '-d',
    databaseName,
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
  ]);
}

function main() {
  const pnpmEntrypoint = process.env.npm_execpath;
  if (!pnpmEntrypoint) fail('pnpm entrypoint is unavailable');
  const pnpm = (args: string[], env: NodeJS.ProcessEnv) =>
    run(process.execPath, [pnpmEntrypoint, ...args], env);
  run('docker', ['compose', 'up', '-d', '--wait']);
  try {
    resetDatabase(sourceDatabase);
    const sourceUrl = isolatedUrl(sourceDatabase);
    pnpm(['db:migrate'], { ...process.env, DATABASE_URL: sourceUrl });
    pnpm(['db:seed'], { ...process.env, DATABASE_URL: sourceUrl });
    dockerPostgres([
      'pg_dump',
      '-U',
      'sales_ai',
      '-d',
      sourceDatabase,
      '--format=custom',
      '--file',
      backupPath,
    ]);

    resetDatabase(restoreDatabase);
    dockerPostgres([
      'pg_restore',
      '-U',
      'sales_ai',
      '-d',
      restoreDatabase,
      '--exit-on-error',
      backupPath,
    ]);

    const sourceMigrations = migrationCount(sourceDatabase);
    const restoredMigrations = migrationCount(restoreDatabase);
    if (sourceMigrations !== restoredMigrations) fail('restored migration count differs');
    console.log(
      JSON.stringify({
        result: 'pass',
        sourceMigrations: Number(sourceMigrations),
        restoredMigrations: Number(restoredMigrations),
        externalCalls: 0,
      }),
    );
  } finally {
    dockerPostgres(['rm', '-f', backupPath]);
    dropDatabase(sourceDatabase);
    dropDatabase(restoreDatabase);
  }
}

main();
