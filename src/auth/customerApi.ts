// Typed calls to Shopify's Customer Account API (GraphQL). The endpoint comes from discovery, the token from session.ts.
import { AuthError, toAuthError } from './errors';
import { getAccessToken, getDiscovery } from './session';

export type Money = { amount: string; currencyCode: string };
export type Address = {
  id: string; firstName: string; lastName: string; company: string;
  address1: string; address2: string; city: string; province: string; zoneCode: string;
  zip: string; country: string; countryCode: string; phoneNumber: string; formatted: string[];
};
export type AddressInput = {
  firstName?: string; lastName?: string; company?: string; address1?: string; address2?: string;
  city?: string; zoneCode?: string; zip?: string; countryCode?: string; phoneNumber?: string;
};
export type OrderLine = {
  id: string; title: string; variantTitle: string | null; quantity: number; variantId: string | null;
  image: string | null; attributes: { key: string; value: string }[];
};
export type Order = {
  id: string; name: string; processedAt: string; cancelledAt: string | null;
  financialStatus: string | null; fulfillmentStatus: string | null;
  total: Money; statusPageUrl: string; lines: OrderLine[];
};
export type MarketingState = 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'NOT_SUBSCRIBED' | 'PENDING' | 'INVALID' | 'REDACTED' | string;
export type Profile = {
  id: string; firstName: string; lastName: string; displayName: string;
  email: string; emailMarketing: MarketingState | null;
  phone: string; smsMarketing: MarketingState | null;
  defaultAddressId: string | null;
  addresses: Address[];
  orders: Order[];
  /** false when that part could not be loaded and older cached data was kept */
  fresh: { addresses: boolean; orders: boolean };
  fetchedAt: number;
};

/** A validation message from Shopify (already localised by the API when possible). */
export class CustomerUserError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) { super(message); this.name = 'CustomerUserError'; this.code = code; }
}

type GqlError = { message: string; extensions?: { code?: string } };

async function post<T>(query: string, variables: Record<string, unknown> | undefined, token: string): Promise<{ status: number; data?: T; errors?: GqlError[] }> {
  const d = await getDiscovery();
  let signal: AbortSignal | undefined;
  try { signal = AbortSignal.timeout(15000); } catch { signal = undefined; }
  const res = await fetch(d.graphqlApi, {
    method: 'POST',
    // The Customer Account API takes the raw access token, without a "Bearer" prefix.
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: token, 'User-Agent': 'BarakatOpticalApp' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (res.status === 401) return { status: 401 };
  let json: { data?: T; errors?: GqlError[] } = {};
  try { json = await res.json(); } catch { /* handled below */ }
  return { status: res.status, data: json.data, errors: json.errors };
}

export async function customerGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  try {
    let r = await post<T>(query, variables, await getAccessToken());
    if (r.status === 401) r = await post<T>(query, variables, await getAccessToken(true)); // token revoked early: refresh once
    if (r.status === 401) throw new AuthError('expired');
    if (r.status === 429 || r.status >= 500) throw new AuthError('network', `customer api ${r.status}`);
    if (r.errors?.length) {
      if (r.errors.some((e) => e.extensions?.code === 'THROTTLED')) throw new AuthError('network', 'throttled');
      throw new AuthError('server', r.errors.map((e) => e.message).join('; '));
    }
    if (!r.data) throw new AuthError('server', `customer api ${r.status}`);
    return r.data;
  } catch (e) {
    if (e instanceof CustomerUserError) throw e;
    throw toAuthError(e);
  }
}

const ADDRESS = 'id firstName lastName company address1 address2 city province zoneCode zip country countryCode phoneNumber formatted';
type RawAddress = { [K in keyof Address]: Address[K] | null } & { id: string };
const str = (v: string | null | undefined) => v ?? '';
const shapeAddress = (a: RawAddress): Address => ({
  id: a.id, firstName: str(a.firstName), lastName: str(a.lastName), company: str(a.company), address1: str(a.address1), address2: str(a.address2),
  city: str(a.city), province: str(a.province), zoneCode: str(a.zoneCode), zip: str(a.zip), country: str(a.country), countryCode: str(a.countryCode),
  phoneNumber: str(a.phoneNumber), formatted: a.formatted ?? [],
});

type RawMe = { customer: {
  id: string; firstName: string | null; lastName: string | null; displayName: string;
  emailAddress: { emailAddress: string | null; marketingState: string | null } | null;
  phoneNumber: { phoneNumber: string | null; marketingState: string | null } | null;
} };
type RawAddresses = { customer: { defaultAddress: { id: string } | null; addresses: { nodes: RawAddress[] } } };
type RawOrders = { customer: { orders: { nodes: {
  id: string; name: string; processedAt: string; cancelledAt: string | null; financialStatus: string | null; fulfillmentStatus: string | null;
  totalPrice: Money; statusPageUrl: string;
  lineItems: { nodes: { id: string; title: string; variantTitle: string | null; quantity: number; variantId: string | null; image: { url: string } | null; customAttributes: { key: string; value: string | null }[] | null }[] };
}[] } } };

/**
 * Loads the profile in three independent requests so one failing part (for example orders on a slow network)
 * does not hide the rest. `previous` supplies the cached addresses / orders to keep in that case.
 */
export async function fetchProfile(previous?: Profile | null): Promise<Profile> {
  const [me, addr, ord] = await Promise.allSettled([
    customerGql<RawMe>(`query Me { customer { id firstName lastName displayName
      emailAddress { emailAddress marketingState } phoneNumber { phoneNumber marketingState } } }`),
    customerGql<RawAddresses>(`query Addresses { customer { defaultAddress { id } addresses(first: 30) { nodes { ${ADDRESS} } } } }`),
    customerGql<RawOrders>(`query Orders { customer { orders(first: 20, sortKey: PROCESSED_AT, reverse: true) { nodes {
      id name processedAt cancelledAt financialStatus fulfillmentStatus totalPrice { amount currencyCode } statusPageUrl
      lineItems(first: 50) { nodes { id title variantTitle quantity variantId image { url } customAttributes { key value } } } } } } }`),
  ]);
  if (me.status === 'rejected') throw me.reason;
  // A dead session must surface even if the first request squeaked through.
  for (const r of [addr, ord]) if (r.status === 'rejected' && r.reason instanceof AuthError && r.reason.code === 'expired') throw r.reason;
  const c = me.value.customer;
  const sameCustomer = previous?.id === c.id;
  return {
    id: c.id, firstName: str(c.firstName), lastName: str(c.lastName), displayName: c.displayName,
    email: str(c.emailAddress?.emailAddress), emailMarketing: c.emailAddress?.marketingState ?? null,
    phone: str(c.phoneNumber?.phoneNumber), smsMarketing: c.phoneNumber?.marketingState ?? null,
    defaultAddressId: addr.status === 'fulfilled' ? addr.value.customer.defaultAddress?.id ?? null : sameCustomer ? previous!.defaultAddressId : null,
    addresses: addr.status === 'fulfilled' ? addr.value.customer.addresses.nodes.map(shapeAddress) : sameCustomer ? previous!.addresses : [],
    orders: ord.status === 'fulfilled'
      ? ord.value.customer.orders.nodes.map((o) => ({
        id: o.id, name: o.name, processedAt: o.processedAt, cancelledAt: o.cancelledAt, financialStatus: o.financialStatus, fulfillmentStatus: o.fulfillmentStatus,
        total: o.totalPrice, statusPageUrl: o.statusPageUrl,
        lines: o.lineItems.nodes.map((l) => ({
          id: l.id, title: l.title, variantTitle: l.variantTitle, quantity: l.quantity, variantId: l.variantId, image: l.image?.url ?? null,
          attributes: (l.customAttributes ?? []).filter((a): a is { key: string; value: string } => !!a.value),
        })),
      }))
      : sameCustomer ? previous!.orders : [],
    fresh: { addresses: addr.status === 'fulfilled', orders: ord.status === 'fulfilled' },
    fetchedAt: Date.now(),
  };
}

type UserErrors = { message: string; code?: string | null }[];
const check = (errs: UserErrors | undefined | null) => {
  if (errs?.length) throw new CustomerUserError(errs[0].message, errs[0].code ?? undefined);
};

export async function updateName(firstName: string, lastName: string): Promise<void> {
  const d = await customerGql<{ customerUpdate: { userErrors: UserErrors } }>(
    `mutation UpdateName($input: CustomerUpdateInput!) { customerUpdate(input: $input) { customer { id } userErrors { field message } } }`,
    { input: { firstName, lastName } });
  check(d.customerUpdate.userErrors);
}

export async function createAddress(address: AddressInput, makeDefault: boolean): Promise<void> {
  const d = await customerGql<{ customerAddressCreate: { userErrors: UserErrors } }>(
    `mutation AddAddress($address: CustomerAddressInput!, $defaultAddress: Boolean) {
      customerAddressCreate(address: $address, defaultAddress: $defaultAddress) { customerAddress { id } userErrors { field message code } } }`,
    { address, defaultAddress: makeDefault });
  check(d.customerAddressCreate.userErrors);
}

export async function updateAddress(addressId: string, address: AddressInput | null, makeDefault?: boolean): Promise<void> {
  const d = await customerGql<{ customerAddressUpdate: { userErrors: UserErrors } }>(
    `mutation EditAddress($addressId: ID!, $address: CustomerAddressInput, $defaultAddress: Boolean) {
      customerAddressUpdate(addressId: $addressId, address: $address, defaultAddress: $defaultAddress) { customerAddress { id } userErrors { field message code } } }`,
    { addressId, address: address ?? undefined, defaultAddress: makeDefault ? true : undefined });
  check(d.customerAddressUpdate.userErrors);
}

export async function deleteAddress(addressId: string): Promise<void> {
  const d = await customerGql<{ customerAddressDelete: { userErrors: UserErrors } }>(
    `mutation RemoveAddress($addressId: ID!) { customerAddressDelete(addressId: $addressId) { deletedAddressId userErrors { field message code } } }`,
    { addressId });
  check(d.customerAddressDelete.userErrors);
}

export async function setEmailMarketing(subscribe: boolean): Promise<void> {
  const name = subscribe ? 'customerEmailMarketingSubscribe' : 'customerEmailMarketingUnsubscribe';
  const d = await customerGql<Record<string, { userErrors: UserErrors }>>(
    `mutation EmailMarketing { ${name} { emailAddress { marketingState } userErrors { field message code } } }`);
  const errs = d[name]?.userErrors ?? [];
  // "Already (un)subscribed" is the state the customer asked for, not a failure.
  if (errs.some((e) => /ALREADY/.test(e.code ?? ''))) return;
  check(errs);
}
