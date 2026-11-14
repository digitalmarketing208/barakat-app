# ERP integration (Business Central / LS Central)

## Architecture
App -> **ERP gateway** (small backend proxy, `EXPO_PUBLIC_ERP_API`, optional) -> Business Central (API v2.0 / OData)
or LS Central Commerce Service. The app holds no ERP credentials and never calls the ERP directly.
If the env var is unset every `erp.*` call returns `null` and `useBranchStock().enabled` is `false` (UI hidden).
Code: `src/erp/{types,client,useBranchStock}.ts`. Calls: JSON only, 8s timeout, failures throw `ErpError` (typed `ErrorCode`:
`bad_request`, `unauthorized`, `not_found`, `network`, `server`).

## Gateway endpoints
1. `GET /v1/stock?sku=ABC` or `?handle=ray-ban-rb3025`
   -> `[{"branchId":"RUH-01","qty":4},{"branchId":"JED-02","qty":0}]`
2. `POST /v1/order-status`  body `{"orderNo":"BO-10234","mobile":"966501234567"}`
   -> `{"status":"ready","updatedAt":"2026-11-14T09:30:00Z","branch":"RUH-01"}`
   status: received | processing | ready | shipped | delivered | cancelled. 404 when orderNo and mobile do not match.
3. Member: not an ERP call. `erp.member(mobile)` is a pointer to the Rewards API (`src/rewards/rewardsApi.ts`).

## Mapping: Business Central
- Handle/SKU -> `items` (`number` = SKU; gateway keeps a handle->item no. map, e.g. Shopify variant SKU = item number).
- Stock per branch -> `itemLedgerEntries` / item `inventory` filtered by `locationCode`, summed `remainingQuantity`
  (or the Item Availability by Location page). `branchId` = Location Code.
- Order status -> `salesOrders` (status Open/Released, `externalDocumentNumber` = Shopify order no.), then
  `salesInvoices` (posted) for shipped/delivered. Match customer by `phoneNumber`.

## Mapping: LS Central
- Stock: Commerce Service inventory lookup per store (`branchId` = Store No.).
- Orders: Customer Orders (Click & Collect / Ship) status; shop order no. in the external-ID field.
- Members: see `/home/claude/rewards-pkg/barakat-rewards/docs/ls-central-mapping.md` (Member Management).

## Auth
- Gateway -> Business Central: OAuth 2.0 client credentials (Microsoft Entra app registration, scope
  `https://api.businesscentral.dynamics.com/.default`), secret in the gateway's secret store only. Least-privilege
  permission set: read items, inventory, sales orders/invoices.
- App -> gateway: no secret. Public read-only data plus rate limits; order status is authorised by orderNo + mobile pair.

## Security notes
- Never put ERP URLs, tenant IDs, client secrets or tokens in `EXPO_PUBLIC_*` (they ship in the bundle).
- Gateway returns a minimal DTO only (no costs, prices, customer names, other customers' data); whitelist fields.
- Rate-limit per IP and per mobile; uniform 404 on mismatch (no order enumeration); HTTPS only; no logging of mobile numbers.
- Cache stock 30-60s at the gateway to protect the ERP API quota; the app caches offline via `src/offline.ts`.
- Stock is advisory: round to "in stock / low / out" in the UI if exact counts are sensitive.

## Current system: Microsoft Dynamics SL 2009 (per owner, 14 Nov 2026)
SL 2009 has no REST/OData API, so the gateway (not the app) reads it. Never expose SQL Server to the internet.
- Option A (recommended): nightly or 15-minute sync of read-only views from the SL SQL Server database into a small cloud store (Cloudflare D1 or Postgres); the gateway serves `/stock` and `/order-status` from that store. Works when SL is offline or being patched.
- Option B: gateway runs on a server inside the network with a read-only SQL login and a secure tunnel (Cloudflare Tunnel). Reads live, depends on SL server uptime.
- Likely SL tables (verify against the real database before building): `Inventory` (item), `INItemSite` (qty on hand and available per site/branch), `SOHeader` and `SOShipHeader` (sales order status), `Customer` (mobile/phone match for loyalty). Branch codes (C102, C199 and so on) map to SL site IDs.
- Mapping key: Shopify variant SKU = SL `InvtID`. Needs a one-time SKU audit; items without a match show no branch stock.
- Writes (online orders into SL) are out of scope for now: orders stay in Shopify and are keyed into SL by staff.
- LS Central/Business Central notes above apply only after migration; the app code does not change, only the gateway.
