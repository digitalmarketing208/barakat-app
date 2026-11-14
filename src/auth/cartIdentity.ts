// Pre-fills Shopify's hosted checkout by attaching the signed-in customer to the Storefront cart.
// With a customer access token the checkout opens already authenticated (saved addresses, order lands in the account);
// without one only email / phone are sent, exactly like a guest who typed them. Guest checkout is untouched.
import { gql } from '../shopify';

export type BuyerIdentity = { email?: string | null; phone?: string | null; customerAccessToken?: string | null; countryCode?: string };

const MUTATION = `mutation BuyerIdentity($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
  cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) { cart { id } userErrors { field message } } }`;
type Result = { cartBuyerIdentityUpdate: { cart: { id: string } | null; userErrors: { field: string[] | null; message: string }[] } };

const e164 = (p?: string | null) => (p && /^\+[1-9]\d{6,14}$/.test(p.replace(/[\s-]/g, '')) ? p.replace(/[\s-]/g, '') : undefined);

async function send(cartId: string, buyerIdentity: Record<string, unknown>): Promise<boolean> {
  const d = await gql<Result>(MUTATION, { cartId, buyerIdentity });
  return !!d.cartBuyerIdentityUpdate.cart && d.cartBuyerIdentityUpdate.userErrors.length === 0;
}

/**
 * Returns true when the cart now carries the buyer. Never throws: checkout must open either way.
 * Order of attempts: token + contact details, then contact details only, then email only.
 */
export async function updateCartBuyerIdentity(cartId: string, id: BuyerIdentity): Promise<boolean> {
  if (!cartId) return false;
  const email = id.email?.trim() || undefined;
  const phone = e164(id.phone);
  const countryCode = id.countryCode ?? 'SA'; // Barakat sells inside Saudi Arabia only
  const attempts: Record<string, unknown>[] = [];
  if (id.customerAccessToken) attempts.push({ customerAccessToken: id.customerAccessToken, email, phone, countryCode });
  if (email || phone) attempts.push({ email, phone, countryCode });
  if (email && phone) attempts.push({ email, countryCode });
  for (const a of attempts) {
    try { if (await send(cartId, a)) return true; } catch { /* try the next, simpler identity */ }
  }
  return false;
}

/** Detaches the customer from the cart on sign-out so the next person on this phone starts clean. Never throws. */
export async function clearCartBuyerIdentity(cartId: string): Promise<void> {
  if (!cartId) return;
  try { await send(cartId, { customerAccessToken: null, email: null, phone: null }); } catch { /* best effort */ }
}
