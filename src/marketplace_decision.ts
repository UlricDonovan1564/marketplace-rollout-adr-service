import { z } from 'zod';

export const sellerAssetSchema = z.object({
  sellerId: z.string().min(1),
  assetId: z.string().min(1),
  inventoryCount: z.number().int().nonnegative(),
  fulfillmentMode: z.enum(['manual', 'marketplace_handoff'])
});

export const buyerUpdateSchema = z.object({
  buyerId: z.string().min(1),
  email: z.string().email(),
  requestedDelivery: z.enum(['standard', 'expedited'])
});

export const orderHandoffSchema = z.object({
  orderId: z.string().min(1),
  sellerAsset: sellerAssetSchema,
  buyerUpdate: buyerUpdateSchema,
  featureFlagKey: z.string().min(1)
});

export type OrderHandoffInput = z.infer<typeof orderHandoffSchema>;

export type OrderHandoffResult = {
  orderId: string;
  sellerId: string;
  buyerId: string;
  handoffState: 'marketplace_handoff_ready' | 'seller_direct_fallback';
  buyerMessage: string;
  sellerAction: string;
};

export function decideMarketplaceHandoff(input: OrderHandoffInput, rolloutEnabled: boolean): OrderHandoffResult {
  const parsed = orderHandoffSchema.parse(input);
  const hasInventory = parsed.sellerAsset.inventoryCount > 0;
  const sellerSupportsMarketplace = parsed.sellerAsset.fulfillmentMode === 'marketplace_handoff';
  const useMarketplace = rolloutEnabled && hasInventory && sellerSupportsMarketplace;

  if (useMarketplace) {
    return {
      orderId: parsed.orderId,
      sellerId: parsed.sellerAsset.sellerId,
      buyerId: parsed.buyerUpdate.buyerId,
      handoffState: 'marketplace_handoff_ready',
      buyerMessage: `Buyer ${parsed.buyerUpdate.email} will receive ${parsed.buyerUpdate.requestedDelivery} marketplace tracking updates.`,
      sellerAction: `Reserve asset ${parsed.sellerAsset.assetId} for marketplace handoff.`
    };
  }

  return {
    orderId: parsed.orderId,
    sellerId: parsed.sellerAsset.sellerId,
    buyerId: parsed.buyerUpdate.buyerId,
    handoffState: 'seller_direct_fallback',
    buyerMessage: `Buyer ${parsed.buyerUpdate.email} will receive direct seller updates while rollout stays off for this order.`,
    sellerAction: `Handle asset ${parsed.sellerAsset.assetId} through the seller direct flow.`
  };
}
