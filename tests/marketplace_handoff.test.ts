import test from 'node:test';
import assert from 'node:assert/strict';
import { decideMarketplaceHandoff } from '../src/marketplace_decision.js';

const baseInput = {
  orderId: 'ord_123',
  featureFlagKey: 'marketplace-order-handoff',
  sellerAsset: {
    sellerId: 'seller_9',
    assetId: 'asset_red_shirt',
    inventoryCount: 4,
    fulfillmentMode: 'marketplace_handoff' as const
  },
  buyerUpdate: {
    buyerId: 'buyer_2',
    email: 'buyer@example.com',
    requestedDelivery: 'expedited' as const
  }
};

test('uses marketplace handoff when rollout is enabled and seller can fulfill', () => {
  const result = decideMarketplaceHandoff(baseInput, true);
  assert.equal(result.handoffState, 'marketplace_handoff_ready');
  assert.equal(result.sellerAction, 'Reserve asset asset_red_shirt for marketplace handoff.');
});

test('falls back to seller direct flow when rollout is disabled', () => {
  const result = decideMarketplaceHandoff(baseInput, false);
  assert.equal(result.handoffState, 'seller_direct_fallback');
  assert.match(result.buyerMessage, /direct seller updates/);
});
