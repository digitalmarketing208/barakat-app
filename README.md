# Barakat Optical app (iOS + Android)

Expo (React Native) app. Arabic/English (RTL), reads your Shopify catalog live through the Storefront API, checkout opens Shopify's own secure checkout.

## 1. Connect to Shopify (2 minutes, required once)

1. Open https://admin.shopify.com/store/barakatoptical/settings/apps/development → **Create an app** → name it "Barakat Mobile App".
2. **Configure Storefront API scopes**, tick: `unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`, `unauthenticated_read_product_tags`, `unauthenticated_read_collection_listings`, `unauthenticated_write_checkouts`, `unauthenticated_read_checkouts`. Save → **Install app**.
3. Copy the **Storefront API access token** (it is a public-read token, safe to ship in the app).
4. Copy `.env.example` to `.env` and paste it:
   `EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=xxxxxxxx`
5. If the app opens with an empty catalog, publish the products to the sales channel your app uses (Products → bulk edit → Sales channels).

Everything after that is automatic: products, prices, stock, images, variants and cart all come from Shopify in real time. Edit a product in Shopify and the app shows it on the next refresh. Arabic/English text comes from Shopify translations (Translate & Adapt).

## 2. Run it

```
npm install
npx expo start        # scan the QR code with Expo Go on your phone
```

## 3. Build and update (EAS)

```
npx eas-cli@latest init && npx eas-cli@latest update:configure   # once, links the Expo project
eas build --profile preview --platform android                   # installable APK
eas update --channel preview --message "what changed"            # OTA JS update
eas build --profile production --platform android                # store build
```
Set `EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN` as an EAS environment variable for `preview` and `production`. See `CONTEXT.md` for the full handover. Bundle ids are `sa.com.barakatoptical.app`.
