// Shopify Storefront API settings.
// Token: Shopify admin > Settings > Apps and sales channels > Develop apps (or the Headless channel)
// > create Storefront API token with unauthenticated_read_product_listings, _read_product_inventory,
// _read_product_tags, _read_collection_listings, _write_checkouts, _read_checkouts.
export const SHOPIFY = {
  domain: process.env.EXPO_PUBLIC_SHOPIFY_DOMAIN ?? 'barakatoptical.com.sa',
  // Shopify's permanent domain also works; custom domain is fine for Storefront API.
  token: process.env.EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? '',
  apiVersion: '2025-10',
};

export const CONTACT = {
  whatsapp: '966559071446',
  tollFree: '8001248882',
  freeDeliveryOver: 150,
  currency: 'SAR',
};
