# CONTEXT (handover for future chats/agents)

## What this is
Barakat Optical (Saudi optical retailer, barakatoptical.com.sa) customer app. Expo SDK 57 / React Native 0.86, Expo Router-free custom React Navigation, Shopify Storefront API (API 2025-10), Arabic (default RTL) + English. Android package and iOS bundle id: `sa.com.barakatoptical.app`. Domestic (Saudi) sales only.

## Layout
- `src/` app code (screens, `shopify.ts` API client, `store.tsx` cart/wishlist, `LensPicker.tsx`, `tryon/` virtual try-on, `i18n.tsx`). Owned by feature agents.
- `locales/{ar,en}.json` native app-name localization (see Localization below).
- `app.json` Expo config; `eas.json` build/update profiles; `scripts/` node test scripts; `.env.example` env docs.

## Build
- Dev client: `eas build --profile development --platform android`
- Internal APK: `eas build --profile preview --platform android` (channel `preview`, EAS env `preview`)
- Store: `eas build --profile production --platform android` (autoIncrement, remote version source)
- Local checks: `npm run typecheck`, `npm run lint`, `npm run doctor`.

## OTA updates (expo-updates)
`runtimeVersion` policy `appVersion`, so OTA only reaches builds with the same `version` in app.json. Bump `version` whenever native code/deps change, then rebuild. Ship JS-only changes with `eas update --channel preview --message "..."` (or `production`). Each build profile has a matching channel.
OWNER TODO (one time, needs login): run `eas init` and `eas update:configure`. This adds `extra.eas.projectId` and `updates.url` to app.json. They are deliberately NOT hardcoded. Also set `owner` if using an org account.

## Env vars
`EXPO_PUBLIC_SHOPIFY_DOMAIN` (default barakatoptical.com.sa), `EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN` (public read-only Storefront token). Locally in `.env` (gitignored); for builds create them in EAS (expo.dev > project > Environment variables) for the `preview` and `production` environments, which eas.json selects via `environment`. Without the token the catalog is empty.

## Shopify facts
- Home rails (collection handles): `new-arrivals-all-collections`, `gamer-vision-blue-light-gaming-glasses`, `eyeglasses-all-brands`, `sunglasses-all-brands`, `kids-collections-all-eyeglasses-and-sunglasses`, `accessories-1` (same order as the website home).
- Lens add-on products (priced add-ons): `lens-addon-uv` 249 SAR, `lens-addon-blue-cut` 500, `lens-addon-gamers` 349, `lens-addon-night-driving` 599.
- Cart pairing: a lens line shares a `_group` attribute with its frame line and also carries `For frame`; lens quantity follows the frame (`src/store.tsx`). Checkout is Shopify's hosted checkout.

## Localization / lint fix (root cause)
`lintVitalRelease` failed with `ExtraTranslation` because `locales/*.json` held a flat `{"CFBundleDisplayName": ...}`; Expo copies flat keys into Android `values-b+xx/strings.xml`, where the key had no default-locale counterpart. Per Expo docs the files must be platform-scoped: `"ios": {CFBundleDisplayName}` and `"android": {app_name}`. `app_name` exists in the default `values/strings.xml`, so no extra translation. Verified with `expo prebuild --platform android` (strings.xml only contains app_name). The lint-skipping `gradleCommand` is therefore NOT used in eas.json; if lint ever fails again, fix the cause rather than re-adding `-x lintVitalRelease`.
`expo-localization` plugin declares `supportedLocales` ar/en (per-app language).

## Native modules / plugins
`react-native-vision-camera` v5 (+ `-face-detector`, `nitro-modules`, `nitro-image`) have no Expo config plugin; they need only the CAMERA permission (already in android.permissions and iOS NSCameraUsageDescription). Android minSdk comes from RN default (24). Autolinking handles the rest. Requires a dev/preview build, not Expo Go.

## Known gaps
- Try-on (vision-camera + face detector + view-shot) not tested on a real device.
- 4 frame variants still double-priced; find them in Shopify admin.
- `react-native-worklets` is a required peer of reanimated 4 and vision-camera-face-detector but is not in package.json (expo-doctor flags it): run `npx expo install react-native-worklets` and add the babel plugin if the package requires it, before building.
- expo-doctor also reports patch-version drift (expo, expo-location, expo-notifications etc.): `npx expo install --fix`.
- `userInterfaceStyle: light` needs `expo-system-ui` on Android to take effect.
- iOS not built/tested.

## Security
Never commit `.env`, keystores or tokens. The Storefront token is public-read but rotate it in Shopify if exposed; any token pasted in chats should be rotated. Keep EAS/Expo access tokens out of the repo.
