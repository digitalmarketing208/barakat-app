# Membership: card, wallet-style redeem, plans, wallet passes

Code: `src/rewards/*` (card, redeem, plan cards), `src/wallet/*` (pass builders). Status: client done; the server endpoints below are a CONTRACT the Rewards server does not have yet. Until it ships, the app degrades to the older WhatsApp-code redeem.

## Where things live
- Tier names (one map, owner edits): `src/rewards/tierLabels.ts`. Strings read it, so card, ladder, history and perks follow.
- Perks per tier (one file, every perk marked PROPOSED, no prices): `src/rewards/perks.ts`.
- Card colours: `src/rewards/cardTheme.ts` derives every shade from `src/theme.ts` with `mix()`. Shine and embossed text: `Metallic.tsx`.
- Member card, perks, pending receipts: `parts.tsx`. Redeem: `RedeemWallet.tsx`, `redeemApi.ts`, `redeemLogic.ts`, `device.ts`.
- Tests: `npx tsx src/rewards/membership.test.ts`, `npx tsx src/wallet/wallet.test.ts`.

## Redeem contract (customer token in `Authorization: Bearer`)
Rules reused from `/public/config`: `min_redeem`, `step_redeem`, `cap_percent`, `point_value_sar`. The member picks points in steps; the screen shows the SAR value and the minimum invoice for the 50% cap.
- `POST /me/redeem-hold` `{ points, device_id }` -> `{ ok, hold_id, expires_at, points? }`. Reserves the points (usable balance drops by `points`). Idempotent per device: the same device asking again while a hold is open gets the same hold back. Another device while a hold is open: error `hold_exists`. Errors also `min_points`, `step_points`, `insufficient_points`, `frozen`, `not_member`. Suggested hold lifetime 10 minutes.
- `POST /me/redeem-token` `{ hold_id }` -> `{ ok, token, expires_in }`. Mints a new opaque token (random, 128+ bits) and invalidates the previous one. `expires_in` about 60 s. The app renews when the countdown ends (clamped to 5..90 s). Errors `hold_not_found`, `hold_expired`, `device_mismatch`.
- `GET /me/redeem-hold/<hold_id>` -> `{ ok, status: "held"|"used"|"expired"|"cancelled", expires_at }`. The app polls every 3 s; `used` closes the screen with a success haptic, `expired` and `cancelled` close with a message. Then the app re-reads `/me`.
- `POST /me/redeem-cancel` `{ hold_id }` -> `{ ok }`. Returns the points. Cancelling a hold that is already gone answers `hold_not_found` or `hold_expired` (the app treats both as finished).
- Till (needed by the server agent, not used by the app): `POST /till/redeem/scan` `{ token, invoice_sar }` (till token) -> `{ ok, redemption_id, points, sar_value, member }`. Checks token validity, the 50% cap against `invoice_sar` (error `cap_exceeded` with the allowed maximum), marks the hold `used`, writes the `redeem` ledger row with channel `app-qr`.
- Feature check: a 404/405/501 on `redeem-hold` becomes client error `unsupported` and the screen shows the previous WhatsApp-code flow. Nothing else changes. Remove the fallback once the server ships.

## Security model
- The QR holds only the opaque token. Never a mobile number, name or member id.
- Single use: the till scan atomically moves the hold `held -> used`; a second scan fails. A token is also dead after `expires_in` or when a newer token is minted.
- Device bound: the hold stores `device_id` (random uuid in expo-secure-store, key `barakat.device.v1`). `redeem-token` and `redeem-cancel` must come from the same device; the token endpoint rejects other devices with `device_mismatch`.
- Hold semantics: points leave the usable balance at hold time (so they cannot be spent twice) and return on `cancelled`, `expired`, or a till refusal. Only one open hold per member household. Server job: expire holds past `expires_at` and return the points.
- The member is authenticated by the 30-day customer token; the app adds a biometric confirm (expo-local-authentication) before creating the hold, with a plain confirm button when no biometrics are enrolled. iOS needs `NSFaceIDUsageDescription` through the `expo-local-authentication` plugin in app.json (owner or build agent: the plugin is listed, check the permission text is set).
- The app never edits balance locally. The offline view shows the cached balance "as of <time>", disables the button and says a QR needs a connection. Receipt claims queued by `src/receipts` show as "pending", apart from the balance.
- Brightness boost uses `expo-brightness` if installed (loaded optionally, not installed today: `npx expo install expo-brightness`, then rebuild). Without it nothing breaks.
- Earn at the till still uses the member card QR (mobile number) as before; it is for earning, not spending. Moving it to a token is a later step.

## Plans: subscribe through a separate checkout
Plan cards: `src/rewards/PlanCards.tsx` (Plus silver tone, Max gold on black), used by `Plans.tsx`, which both the Rewards tab and the Plans screen show. Swipeable carousel when the two cards do not fit side by side.
- Live price: `fetchProduct('barakat-plus' | 'barakat-max')`, first variant price. The "indicative" label shows only until it loads (or if it fails). Fallback figures 99 / 249 SAR are indicative.
- Subscribe or upgrade: requires a signed-in member (otherwise the Rewards sign-in and join flow opens). Then a NEW one-line Storefront cart is created (`cartCreateLines`) with the plan variant, quantity 1, attributes `Member mobile` (9665XXXXXXXX) and `Plan` (`plus`|`max`), and its `checkoutUrl` opens in the in-app browser. The member's own cart is never touched. Offline: message "needs an internet connection". If the product cannot load or the cart fails, the old WhatsApp message is the fallback.
- Activation is server side: the Rewards server activates the plan when the paid order contains SKU `BARAKAT-PLUS` or `BARAKAT-MAX` (see API.md, Paid plans). The `Member mobile` attribute lets the server credit the right member.

## Wallet passes (`src/wallet`, for the server later)
- Google Wallet: `buildLoyaltyClass`, `buildLoyaltyObject`, `buildRotatingBarcode`, `buildSaveToWalletClaims` (unsigned claims; the server signs RS256 with its service-account key). Rotating barcode uses pre-issued opaque values per 60 s period (`initialRotatingBarcodeValues`); the server must mint one token per period ahead of time, so the wallet code is only useful for short windows unless the till accepts a member-level rotating code. Field names should be re-checked against Google's current reference.
- Apple Wallet: `buildApplePass` makes `pass.json` (generic style: balance, tier, plan). Apple has no rotating barcode: the QR is a static non-secret member code that must never grant a discount. Spending stays in the app. Balance updates need `webServiceURL` plus APNs push, a server task.
- The builders hold no keys. Images, manifest, signing and zipping are server work.

## What the owner must provide
1. Apple Developer Program account (paid, yearly) for a Pass Type ID, its certificate (.p12), Team ID, and the WWDR certificate; also needed anyway for an iOS store release.
2. Google Wallet issuer account: Issuer ID from the Google Pay and Wallet Console, a service account with Wallet Object Issuer role and its JSON key, and Google's review of the program (logo, name) before passes go public.
3. Final tier names (`tierLabels.ts`) and approval of each perk in `perks.ts` (then set `status: 'live'`); no perk is promised before that.
4. Server work: the four `/me/redeem-*` endpoints and the till scan endpoint above.
5. Optional: install `expo-brightness` and rebuild the app.
