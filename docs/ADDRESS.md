# Saudi address capture (`src/address/`)

Import everything from `src/address` (`index.ts`): `AddressForm`, `useSavedAddresses`, `useCurrentLocation`, `lookupBest`, `toShopifyAddress`, `fromShopifyAddress`, validators.

## Files
- `types.ts` SaudiAddress, validators (mobile `05xxxxxxxx`/`9665..`/`+966`, building 4 digits, additional 4, postal 5, short address `^[A-Z]{4}[0-9]{4}$`), Arabic-digit normalising, Shopify mapping.
  Shopify: `address1 = "<street>, building <1234>"`, `address2 = "<district> · Short address: RRRD2929 · Additional no. 5678"`, `city`, `zip`, `country SA`, `phone +9665...`. `fromShopifyAddress` parses it back (lat/lng/notes are not stored by Shopify).
- `useCurrentLocation.ts` AR/EN rationale dialog -> `requestForegroundPermissionsAsync` -> `Accuracy.High` fix -> `reverseGeocodeAsync` (city/district/street/postalCode). Handles denied, blocked (opens Settings), services off.
- `AddressForm.tsx` "Use my exact location", pin confirm step, inline validation (after blur/submit), RTL, autofill hints (`textContentType`/`autoComplete` on name, phone, street, city, postal code), National Address autofill.
- `nationalAddress.ts` SPL client. `useSavedAddresses.ts` AsyncStorage list (key `barakat.addresses.v1`), one default, in-memory + disk cache so it works offline.

## Map step (decision)
`react-native-maps` is not installed and on Android needs a Google Maps API key in the native build; `expo-maps` is alpha and needs native config too. Neither can be configured without native/EAS changes, so the confirm step is a dependency-free fallback: shows coordinates + accuracy, four nudge buttons (about 10 m per tap) to adjust the pin, and an "Open in Google Maps" link. To upgrade later: `npx expo install react-native-maps`, add the Google Maps key in `app.json`, rebuild the dev client, then replace `PinConfirm` in `AddressForm.tsx` with a `MapView` + draggable `Marker` (same `lat/lng/onMove` props).

## National Address API (Saudi Post / SPL)
Portal: https://api.address.gov.sa/ . Register, subscribe to the National Address APIs product, copy the key from "Your Subscriptions" on your profile page. Starter plan is limited to 5 calls/min and 100 calls/week (Unlimited needs approval), so lookups run only on a valid short address or when the user taps the button.

Set `EXPO_PUBLIC_NATIONAL_ADDRESS_KEY` in `.env` (local) and as an EAS env var / secret for builds (`eas env:create`). It is a public (bundled) variable, so request production-restricted key access if SPL offers it, or proxy via your backend (like the ERP gateway) before wide release. With no key every lookup returns `null`, the button is hidden and the form shows the helper link "Find my short address" -> https://splonline.com.sa/en/national-address-1/ .

Endpoints used (from the official docs, host `https://apina.address.gov.sa`):
| Use | Doc page | Request |
|---|---|---|
| Short address -> full address | https://api.address.gov.sa/addressdataapi-NationalAddressByShortAddress | `GET /NationalAddress/NationalAddressByShortAddress/NationalAddressByShortAddress?shortaddress=RRRD2929&format=json&encode=utf8&Language=Arabic\|English&page=1&api_key=KEY`. Response `{totalSearchResults, Addresses:[{BuildingNumber, Street, District, City, PostCode, AdditionalNumber}], success, statusdescription}` |
| Short address -> coordinates | https://api.address.gov.sa/addressdataapi-GeocodesByShortAddress | `GET /NationalAddress/GeoCodeByShortAddress/GeoCodeByShortlAddress?shortaddress=...&format=json&api_key=KEY` (sic "Shortl"). Response `Addresses:[{Latitude, Longitude}]` |
| Building no. + postal (+ additional) | https://api.address.gov.sa/docs/services/583adc5ee6dbd911dc0619d9/operations/583d41cbe6dbd9053ce5db07 | `GET /NationalAddress/v3.1/Address/address-fixed-params?buildingnumber=1234&zipcode=12211[&additionalnumber=5678]&format=json&encode=utf8&language=A`, header `api_key: KEY` |

Verify against a live key before release: (1) the v3.1 fixed-params page publishes no sample response, so the parser reads `Addresses[0]` with the v1 field names and optional `Latitude/Longitude`; (2) the English language value for v3.1 is not documented (code sends `E`; `A` = Arabic is documented); (3) v1 pages document `api_key` as a query parameter, the code also sends it as a header. v3.1 also has reverse geocode (`/v3.1/Address/address-geocode?lat=&long=`, header `api_key`) which could replace device reverse-geocoding for exact Saudi districts: https://api.address.gov.sa/docs/services/583adc5ee6dbd911dc0619d9 . Errors: 400 bad request, 401 bad key, 403 limit reached, 404, 500 (mapped to `NationalAddressException.code`).

## Where to plug it in
```tsx
import { AddressForm, useSavedAddresses, toShopifyAddress } from '../address';
const { addresses, defaultAddress, save, setDefault, remove } = useSavedAddresses();
<AddressForm initial={defaultAddress ?? undefined} onSubmit={async (a) => { await save(a, true); setAddr(toShopifyAddress(a)); }} />
```
- Checkout: pick from `addresses` (default preselected) or show `AddressForm`; pass `toShopifyAddress(a)` as `shippingAddress` to the cart/checkout (`cartBuyerIdentityUpdate.deliveryAddressPreferences` or checkout shipping mutation in `src/shopify.ts`).
- Account: "My addresses" screen listing `addresses` with default badge, edit (`AddressForm initial=...` then `save({...a, id})`), delete, set default.
- Wrap the screen in a `KeyboardAvoidingView`/`ScrollView` with `keyboardShouldPersistTaps="handled"`.
- `app.json` already declares location permissions (iOS `NSLocationWhenInUseUsageDescription`, Android fine/coarse). Optionally reword the iOS text to mention delivery address.

## Privacy
- Location is requested only after the user taps "Use my exact location", with an AR/EN explanation first; foreground, one-time fix, no tracking, no background location.
- Coordinates are used to prefill the form and stay on the device unless the user submits the order; Shopify's MailingAddress does not carry lat/lng, so only the text address leaves the device.
- Saved addresses (name, mobile, address) are stored unencrypted in app-private AsyncStorage on the device only; no payment data. Provide a delete control in the account screen and clear the key `barakat.addresses.v1` on sign-out/"delete my data".
- The National Address key is sent only to api.address.gov.sa; the short address typed by the user is sent there (SPL privacy policy applies).
