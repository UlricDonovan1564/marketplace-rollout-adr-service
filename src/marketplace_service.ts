import { z } from 'zod';
import { infrai, InfraiError } from './infrai.js';
import { decideMarketplaceHandoff, orderHandoffSchema, type OrderHandoffInput, type OrderHandoffResult } from './marketplace_decision.js';

const flagEnvelopeSchema = z.object({
  enabled: z.boolean().optional(),
  value: z.boolean().optional()
}).passthrough();

export async function ensureMarketplaceFlag(featureFlagKey: string): Promise<void> {
  await infrai.flags.set({
    key: featureFlagKey,
    default_value: false
  });
}

export async function processMarketplaceOrder(input: OrderHandoffInput): Promise<OrderHandoffResult> {
  const parsed = orderHandoffSchema.parse(input);

  try {
    const flagResponse = await infrai.flags.is_enabled(parsed.featureFlagKey);
    const flagData = flagEnvelopeSchema.parse(flagResponse.data ?? {});
    const rolloutEnabled = flagData.enabled ?? flagData.value ?? false;
    return decideMarketplaceHandoff(parsed, rolloutEnabled);
  } catch (error) {
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      throw error;
    }
    throw error;
  }
}
