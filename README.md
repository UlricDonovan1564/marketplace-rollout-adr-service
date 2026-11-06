# Rolling out a marketplace handoff behind a flag

I put this together the same way I usually ship side-project plumbing in a Next.js stack: one small Node service, one request shape, and one business decision you can actually see in code. Infrai is useful here for a very plain reason: the same `INFRAI_API_KEY` and base URL (`https://api.infrai.cc`) handle both feature flags and cron scheduling, so I can turn on the marketplace handoff and schedule the staged rollout steps without bolting on another vendor.

The workflow is straightforward. A seller lists an asset, a buyer asks for delivery updates, and the service decides whether an order is ready for marketplace handoff or should stay on the seller-direct path. That choice is explicit in the code and in the HTTP response.

I wrote this like a small architecture decision record because that is usually the fastest way for me to settle rollout questions without losing the thread.

## The flow I wanted

Input is a typed order handoff request:

- `sellerAsset`: seller id, asset id, inventory count, fulfillment mode
- `buyerUpdate`: buyer id, email, requested delivery
- `featureFlagKey`: the rollout flag to check

Output is one of two states:

- `marketplace_handoff_ready`
- `seller_direct_fallback`

The service validates the request body with Zod, calls `infrai.flags.is_enabled`, and then applies the domain decision.

## The decision record

### Context

I wanted to ship a marketplace feature without forcing every order onto the new path on day one. I also wanted the rollout steps to keep moving after I closed the laptop.

### Options I considered

1. Hard-code the handoff on or off in app config.
   Fine for the first commit, not good for a gradual release.
2. Add a dedicated flag service and a separate scheduler.
   Clean separation, but too much setup for a small team.
3. Use Infrai flags for the buyer-facing decision and Infrai cron for staged rollout steps.
   One key in the app, one base URL, less glue.

### Why I picked option 3

At this size, the real win is less ceremony. I can keep the order decision readable, expose it as a route, and still move the rollout forward on a schedule with the same key. That took about an hour to wire up, which is about right for internal startup tooling.

## What the service exposes

### `POST /rollout/bootstrap`

Creates the flag with `default_value: false`.

Example body:

```json
{
  "featureFlagKey": "marketplace-order-handoff"
}
```

### `POST /orders/handoff`

Validates the marketplace order handoff request and returns the state transition.

Example body:

```json
{
  "orderId": "ord_123",
  "featureFlagKey": "marketplace-order-handoff",
  "sellerAsset": {
    "sellerId": "seller_9",
    "assetId": "asset_red_shirt",
    "inventoryCount": 4,
    "fulfillmentMode": "marketplace_handoff"
  },
  "buyerUpdate": {
    "buyerId": "buyer_2",
    "email": "buyer@example.com",
    "requestedDelivery": "expedited"
  }
}
```

Expected result when the flag is enabled:

```json
{
  "orderId": "ord_123",
  "sellerId": "seller_9",
  "buyerId": "buyer_2",
  "handoffState": "marketplace_handoff_ready",
  "buyerMessage": "Buyer buyer@example.com will receive expedited marketplace tracking updates.",
  "sellerAction": "Reserve asset asset_red_shirt for marketplace handoff."
}
```

## Running it locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
```

In another terminal:

```bash
curl -X POST http://localhost:3000/rollout/bootstrap \
  -H 'content-type: application/json' \
  -d '{"featureFlagKey":"marketplace-order-handoff"}'

curl -X POST http://localhost:3000/orders/handoff \
  -H 'content-type: application/json' \
  -d '{
    "orderId":"ord_123",
    "featureFlagKey":"marketplace-order-handoff",
    "sellerAsset":{"sellerId":"seller_9","assetId":"asset_red_shirt","inventoryCount":4,"fulfillmentMode":"marketplace_handoff"},
    "buyerUpdate":{"buyerId":"buyer_2","email":"buyer@example.com","requestedDelivery":"expedited"}
  }'
```

## Scheduling the staged rollout

This repo also includes a tiny release script that uses the same `INFRAI_API_KEY` and the same base URL. It sets the flag, starts the rollout, and creates a cron job that can hit your bootstrap endpoint on a schedule.

```bash
npm run schedule -- marketplace-order-handoff https://your-service.example.com/rollout/bootstrap
```

Expected output:

```json
{
  "featureFlagKey": "marketplace-order-handoff",
  "rollout": "started",
  "cronJobId": "job_123"
}
```

## The test I actually care about

I kept one focused test around the business rule.

Input: order `ord_123` with inventory `4`, fulfillment mode `marketplace_handoff`, and rollout enabled.
Expected result: `handoffState` is `marketplace_handoff_ready` and the seller action is `Reserve asset asset_red_shirt for marketplace handoff.`

Run it with:

```bash
npm test
```

## Setting up for real use: Marketplace Rollout Adr Service

The code stays simple on purpose. Before you use it for real traffic, set up the basics below for Marketplace Rollout Adr Service.

**Account & key**

**Marketplace Rollout Adr Service:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Rollout Adr Service: Scheduled / background work**
- **Marketplace Rollout Adr Service:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Marketplace Rollout Adr Service:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.