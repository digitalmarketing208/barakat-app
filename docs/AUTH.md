# Sign-in and customer accounts (AUTH)

Customer sign-in for the Barakat Optical app, built on Shopify's **new customer accounts** through the **Customer Account API** (OAuth 2.0 authorization code + PKCE, public client). Multipass is not used (it needs Shopify Plus; the store is on Basic). All code lives in `src/auth/`.

Guests are never blocked: browsing, cart and Shopify's hosted checkout work exactly as before without an account.

## 1. What the owner must supply

| Item | Where it goes | Status |
|---|---|---|
| Customer Account API **client id** (public, not a secret) | env `EXPO_PUBLIC_SHOPIFY_CUSTOMER_CLIENT_ID` (local `.env` and EAS environments `preview` + `production`) | **needed** |
| Callback scheme `shop.62068883755.app` | `app.json` > `expo.scheme` (see 3) | **needed** |
| Callback URI `shop.62068883755.app://callback` | Shopify admin, Customer Account API settings (see 2) | **needed** |
| `expo-local-authentication` package (fingerprint / face lock) | `npx expo install expo-local-authentication` + plugin (see 3) | optional |
| Privacy contact email for deletion requests | env `EXPO_PUBLIC_PRIVACY_EMAIL` | optional (WhatsApp is always offered) |

`62068883755` is the store's numeric shop id. It is public: it appears in `https://barakatoptical.com.sa/.well-known/openid-configuration`.

No client secret exists for a public mobile client. Nothing secret is stored in the repo or the app bundle.

### Environment variables

```
EXPO_PUBLIC_SHOPIFY_DOMAIN=barakatoptical.com.sa        # already used by the catalog
EXPO_PUBLIC_SHOPIFY_CUSTOMER_CLIENT_ID=                 # from step 2
EXPO_PUBLIC_GOOGLE_LOGIN=0                              # 1 only after Google is enabled in Shopify (section 5)
EXPO_PUBLIC_SHOP_LOGIN=1                                # 0 hides "Continue with Shop"
EXPO_PUBLIC_SHOPIFY_SHOP_ID=62068883755                 # optional fallback; the app.json scheme is what matters
EXPO_PUBLIC_PRIVACY_EMAIL=                              # optional
```

Until the client id is set the sign-in screen shows "Sign-in is not available yet" and the guest path keeps working.

## 2. Shopify admin setup

1. **Turn on new customer accounts**: Settings > Customer accounts > Accounts in online store and checkout > Edit > choose **Customer accounts** (not "Legacy") > Save. Direct link: https://admin.shopify.com/admin/settings/customer_accounts
   (The discovery endpoints already answer for this store, so this is most likely done.)
2. **Install the Headless channel** from the Shopify App Store (free), then Sales channels > Headless > create or open a storefront.
3. Open **Customer Account API settings** for that storefront:
   - Client type: **Public** (mobile apps and SPAs; uses PKCE, no secret).
   - **Callback URI(s)**: add `shop.62068883755.app://callback`. Shopify only accepts mobile callbacks whose scheme starts with `shop.<shop_id>.`; `barakat://` is rejected.
   - JavaScript origins: leave empty (web clients only).
   - Logout URI: leave empty (not applicable to mobile public clients; the app calls the logout endpoint directly).
   - Copy the **Client ID** into `EXPO_PUBLIC_SHOPIFY_CUSTOMER_CLIENT_ID`.
4. Optional, same settings page as step 1: enable **Sign in with Shop** and any social sign-in (section 5). Whatever is enabled there appears on the hosted login page automatically.

Endpoints are not hard-coded. On first use the app reads:

- `https://<domain>/.well-known/openid-configuration` (authorize, token, logout, revoke endpoints)
- `https://<domain>/.well-known/customer-account-api` (GraphQL endpoint, currently API version 2026-10)

and caches them for 24 hours (and keeps the last copy for offline use).

## 3. App configuration (one native rebuild required)

`app.json` already has `"scheme": "barakat"`. It needs the Shopify scheme added, keeping the existing one first:

```json
"scheme": ["barakat", "shop.62068883755.app"]
```

For the optional biometric lock:

```
npx expo install expo-local-authentication
```

and add to `plugins` in `app.json`:

```json
["expo-local-authentication", { "faceIDPermission": "Unlock your Barakat account. / افتح حسابك في بركات" }]
```

`expo-auth-session` and `expo-crypto` are already in `package.json`; `expo-secure-store` and `expo-web-browser` plugins are already listed.

Because a URL scheme and native modules changed, **bump `version` in app.json and make a new build** (`eas build --profile preview --platform android`). An OTA update alone cannot deliver this: `runtimeVersion` follows `version`, and the scheme lives in the native manifest. Sign-in does not work in Expo Go.

The code is defensive about this: `expo-auth-session`, `expo-crypto` and `expo-local-authentication` are loaded lazily, so an older binary that receives the JS still starts; sign-in then reports "update the app" and the biometric switch stays disabled.

## 4. How it works

| File | Role |
|---|---|
| `config.ts` | env values, callback scheme resolution from app.json |
| `session.ts` | discovery, PKCE sign-in (`expo-auth-session` `AuthRequest` + `exchangeCodeAsync`), secure token storage, silent refresh, logout + token revocation |
| `customerApi.ts` | Customer Account API GraphQL: profile, addresses CRUD, default address, orders, email marketing |
| `AuthProvider.tsx` | `useAuth()`: `status` (`loading` / `signedOut` / `signedIn`), `signIn()`, `signOut()`, `profile`, `offline`, `locked` / `unlock()`, `biometric`, `syncCart()`, profile mutations |
| `SignInScreen.tsx` | Arabic / English sign-in screen |
| `AccountScreen.tsx`, `AccountSections.tsx` | profile, addresses, orders + reorder, prescriptions, preferences, Rewards, privacy, sign out |
| `AccountEntry.tsx` | `AccountRow`, `AccountIconButton`, `SignInHint` entry points |
| `cartIdentity.ts` | Storefront `cartBuyerIdentityUpdate` helper for checkout pre-fill |
| `prescriptions.ts`, `vault.ts` | encrypted local storage |
| `strings.ts` | AR / EN copy with identical keys |

**Sign-in.** Every button opens the same Shopify-hosted login page in the system browser tab (Chrome Custom Tab on Android, `ASWebAuthenticationSession` on iOS) with `locale=ar|en`. The customer types an email and receives a 6-digit one-time code (no password), or uses Shop / Google if the store enabled them. The buttons set expectations only; the app cannot force a specific method. Closing the page is treated as a silent cancel, not an error. On Android the login tab stays in Recents so the customer can switch to their mail app for the code and come back.

**Session.** Access token (about 1 hour), refresh token and id token go to `expo-secure-store` only. `getAccessToken()` refreshes silently one minute before expiry; concurrent callers share one refresh. A rejected refresh token (`400/401`) signs the user out cleanly; a network failure does not. On app start the cached profile is shown at once and refreshed in the background, so the account opens offline. Returning to the foreground refreshes data older than a minute.

**Biometric re-unlock (optional).** Off by default. When switched on in Account > Privacy, the account screen asks for fingerprint / face (device passcode as fallback) on cold start and after 5 minutes in the background. While locked no token is released and the cart is not pre-filled. Browsing is unaffected. If biometrics are later removed from the phone, unlocking signs the user out instead.

**Checkout pre-fill.** `useAuth().syncCart(cart.id)` attaches the customer to the Storefront cart: first with the customer access token (hosted checkout opens signed in, with saved addresses, and the order lands in the account), falling back to email + phone, then email only. It never throws and gives up after 4 seconds so checkout always opens. It also runs automatically after sign-in and at app start; sign-out detaches the buyer from the cart.

**Reorder.** Adds an old order's variants back to the cart with their line attributes (lens add-ons keep their frame pairing, with a fresh `_group` id). If one item is sold out the rest are still added and the customer is told how many made it. If Shopify does not return the hidden `_group` attribute for an old order, the lens is added as a normal line.

**Rewards.** Read only. The account screen reads the token the Rewards screen stores after its own mobile verification (`boRewardsToken` in secure-store) and calls `GET /me` through `src/rewards/rewardsApi.ts` to show tier and points. Linking (the OTP), joining, redeeming and consent all stay in the Rewards screen; "Link membership by mobile" opens it. A note appears when the Rewards mobile differs from the account mobile.

**Errors.** Every failure maps to one of: `cancelled`, `network`, `config`, `unavailable`, `expired`, `locked`, `server`, each with Arabic and English copy. Validation messages from Shopify (for example an invalid address) are shown as returned. `useAuth()` outside the provider returns a signed-out guest instead of crashing.

## 5. "Continue with Google"

The app cannot add Google by itself: the login page belongs to Shopify. The button is shown only when `EXPO_PUBLIC_GOOGLE_LOGIN=1`, and it opens the same hosted page.

**Option A (recommended): Shopify's built-in social sign-in.** Released August 2025 for new customer accounts (Google and Facebook).

1. Shopify admin > Settings > Customer accounts (https://admin.shopify.com/admin/settings/customer_accounts) > social sign-in > Google.
2. In Google Cloud Console (https://console.cloud.google.com/apis/credentials) create an OAuth client of type "Web application" and copy the values between the two dashboards exactly as the Shopify screen instructs (Shopify shows the redirect URI to paste into Google; Google gives the client id and secret to paste into Shopify). Google Cloud OAuth is free.
3. Preview, turn it on, confirm the Google button appears on the store's login page in a browser.
4. Set `EXPO_PUBLIC_GOOGLE_LOGIN=1` in EAS (`preview` and `production`) and ship an OTA update. No rebuild is needed for this flag.

If the option is missing in the admin, check that the store is on new (not legacy) customer accounts; plan eligibility is not stated in Shopify's changelog, so confirm on the settings page itself.

**Option B: custom gateway (not recommended).** A small backend performs Google sign-in itself and then has to map the Google identity to a Shopify customer. Without Multipass (Plus only) it cannot create a Shopify customer session, so the customer would still need the Shopify one-time code for orders and checkout. It also adds a server that holds personal data. Use option A.

Google blocks sign-in inside embedded WebViews; this app uses the system browser tab, which Google allows.

## 6. Data: what is stored and where

| Data | Location | Protection | Removed when |
|---|---|---|---|
| Access, refresh, id tokens | `expo-secure-store` (`bo.auth.*`) | iOS Keychain (after first unlock, this device only) / Android Keystore; excluded from Android backup | sign-out, session expiry |
| Cached profile, addresses, last 20 orders | AsyncStorage `vault.profile`, AES-256-GCM | key in secure-store (`bo.vault.key`); falls back to chunked secure-store entries if AES is unavailable | sign-out |
| Saved prescriptions (SPH / CYL / AXIS / ADD / PD, notes) | AsyncStorage `vault.rx.<customer>`, AES-256-GCM | same key; per customer; **never leaves the phone** | "Remove my data from this phone", app uninstall |
| Biometric preference, OAuth endpoint cache | AsyncStorage (`auth.bio`, `auth.discovery`) | not sensitive | uninstall |
| Rewards token | secure-store, owned by the Rewards screen | unchanged | Rewards sign-out |
| Password | never (one-time code on Shopify's page) | | |

Shopify remains the system of record for name, email, phone, addresses, orders and marketing consent. The app adds no backend and no analytics for this feature, and writes no personal data or tokens to logs.

Prescriptions are deliberately kept when the customer simply signs out (so they are there on the next sign-in on the same phone) but they stay encrypted and are only listed for the same customer id. "Remove my data from this phone" erases them.

## 7. PDPL and privacy notes (Saudi Personal Data Protection Law)

This section is a working checklist, not legal advice; have the privacy policy reviewed.

- **Health data.** Prescription values are sensitive data under PDPL. They are stored locally, encrypted, never transmitted by this feature, and the screen says so. When the customer chooses "Send to a branch on WhatsApp" they send it themselves, explicitly. Do not add cloud sync for prescriptions without explicit consent and a policy update.
- **Minimisation.** Scopes requested: `openid email customer-account-api:full` (the only customer scope Shopify offers). The app reads name, email, phone, addresses, the last 20 orders and marketing state, nothing else.
- **Consent for marketing.** Email marketing is a switch the customer controls (`customerEmailMarketingSubscribe` / `Unsubscribe`), off unless they opted in. SMS marketing state is displayed only. Rewards marketing consent stays in the Rewards screen.
- **Access and correction.** Customers see and edit their name and addresses in the app; email and phone changes go through customer service.
- **Deletion.** "Request account deletion" opens WhatsApp (and email when `EXPO_PUBLIC_PRIVACY_EMAIL` is set) with a pre-written request. Staff then erase the customer in Shopify admin (Customers > the customer > More actions > Erase personal data), and should also handle the Rewards membership and ERP record. Apple and Google Play both require an in-app way to start account deletion; this link satisfies that, and the same wording should appear on the store's privacy page. Answer within the period PDPL sets (30 days).
- **Cross-border processing.** Shopify processes account data outside the Kingdom; the privacy policy should state this.
- **Privacy policy.** The sign-in screen links to `/policies/privacy-policy` (Arabic) and `/en/policies/privacy-policy` (English). Add a paragraph on app sign-in, local prescription storage and deletion requests, identical in both languages.
- **Shared phones.** Sign-out clears tokens and the cached profile, detaches the buyer from the cart and revokes the refresh token. The browser tab may still hold Shopify's own session cookie, so the next sign-in on that phone can be one tap for the same person; a different person chooses "use another account" on Shopify's page.

## 8. Registration (files outside `src/auth/`)

`App.tsx` (inside `I18nProvider`, around `StoreProvider`):

```tsx
import { AuthProvider } from './src/auth';
<I18nProvider><AuthProvider><StoreProvider>…</StoreProvider></AuthProvider></I18nProvider>
```

`src/types.ts`, in `RootParams`:

```ts
SignIn: undefined;
Account: undefined;
```

`src/Navigation.tsx`:

```tsx
import { SignInScreen, AccountScreen } from './auth';
<Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'slide_from_bottom' }} />
<Stack.Screen name="Account" component={AccountScreen} />
```

`src/screens/MoreScreen.tsx` (first row of the list) and optionally `HomeScreen` / `TopBar`:

```tsx
import { AccountRow, AccountIconButton } from '../auth';
<AccountRow />            // More or Home list
<AccountIconButton />     // TopBar icon row
```

`src/screens/CartScreen.tsx` (checkout pre-fill):

```tsx
import { useAuth, SignInHint } from '../auth';
const { syncCart } = useAuth();
const checkout = async () => { if (!cart) return; await syncCart(cart.id); /* then open cart.checkoutUrl as today */ };
<SignInHint />            // optional, above the checkout button
```

## 9. Test checklist (real device, preview build)

1. Guest: browse, add to cart, checkout without signing in.
2. Sign in with email code in Arabic and in English; leave to the mail app and return on Android.
3. Close the login page: no error, still a guest.
4. Account: edit name, add / edit / delete address, change default, toggle email offers.
5. Orders: open tracking page, reorder (including a frame with a lens add-on, and an order with a sold-out item).
6. Cart > checkout while signed in: contact and address pre-filled.
7. Airplane mode: account opens from cache with the offline pill; edits show the connection error.
8. Leave the app idle for more than an hour, then open the account: data refreshes without a new login.
9. Biometric lock on: kill and reopen the app, account asks for fingerprint / face.
10. Sign out, then "Remove my data from this phone"; confirm prescriptions are gone.

Not yet verified on a device: the full OAuth round trip (needs the client id and the new build), whether Shopify issues a refresh token for this Headless public client (it does for clients configured on the shop; if it ever does not, the session lasts one hour and the user is asked to sign in again), and iOS.
