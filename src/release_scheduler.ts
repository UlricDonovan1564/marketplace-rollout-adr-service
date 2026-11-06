import { infrai } from './infrai.js';

async function main(): Promise<void> {
  const featureFlagKey = process.argv[2] ?? 'marketplace-order-handoff';
  const bootstrapUrl = process.argv[3] ?? 'https://example.com/rollout/bootstrap';

  await infrai.flags.set({
    key: featureFlagKey,
    default_value: false
  });

  await infrai.flags.rollout(featureFlagKey, {
    key: featureFlagKey,
    percentage: 10,
    salt: featureFlagKey,
    sticky_unit: 'user_id',
    version: 1
  });

  const schedule = await infrai.cron.create({
    cron_expr: '0 */6 * * *',
    task: bootstrapUrl
  });

  console.log(JSON.stringify({
    featureFlagKey,
    rollout: 'started',
    cronJobId: schedule.data.job_id
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
