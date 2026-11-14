import { Ionicons } from '@expo/vector-icons';
import type { Key } from './i18n';

export type Cat = { id: string; label: Key; icon: keyof typeof Ionicons.glyphMap; query: string; collection?: string };

// Queries use Shopify product search syntax and match the live catalog's productType / tags.
export const CATEGORIES: Cat[] = [
  { id: 'eyeglasses', label: 'eyeglasses', icon: 'glasses-outline', query: '(product_type:Eyeglasses OR product_type:"Optical Frame")', collection: 'eyeglasses-all-brands' },
  { id: 'sunglasses', label: 'sunglasses', icon: 'sunny-outline', query: 'product_type:Sunglasses', collection: 'sunglasses-all-brands' },
  { id: 'lenses', label: 'contactLenses', icon: 'ellipse-outline', query: '(product_type:"Contact Lens" OR product_type:"Colored Contact Lens")', collection: 'contact-lenses' },
  { id: 'kids', label: 'kids', icon: 'happy-outline', query: 'tag:Kids', collection: 'kids-collections-all-eyeglasses-and-sunglasses' },
  { id: 'accessories', label: 'accessories', icon: 'bag-handle-outline', query: 'product_type:Accessories' },
];

// `tag` is the bare Shopify tag (used by collection filters); `query` is the same thing in search syntax.
export const GENDERS: { id: string; label: Key; query: string; tag?: string }[] = [
  { id: 'all', label: 'all', query: '' },
  { id: 'men', label: 'men', query: 'tag:Mens', tag: 'Mens' },
  { id: 'women', label: 'women', query: 'tag:Women', tag: 'Women' },
  { id: 'unisex', label: 'unisex', query: 'tag:Unisex', tag: 'Unisex' },
];

export const SHAPES: { id: string; label: Key; query: string; tag: string }[] = [
  { id: 'round', label: 'round', query: 'tag:Round', tag: 'Round' },
  { id: 'square', label: 'square', query: 'tag:Square', tag: 'Square' },
  { id: 'cat', label: 'cat', query: 'tag:Cat-Eye', tag: 'Cat-Eye' },
  { id: 'aviator', label: 'aviator', query: 'tag:Aviator', tag: 'Aviator' },
  { id: 'rectangle', label: 'rectangle', query: 'tag:Rectangle', tag: 'Rectangle' },
];

// `col` is the matching sort key when the list is a collection (ProductCollectionSortKeys).
export const SORTS: { id: string; label: Key; sort: 'BEST_SELLING' | 'CREATED_AT' | 'PRICE'; reverse: boolean; web?: boolean; col: 'COLLECTION_DEFAULT' | 'BEST_SELLING' | 'CREATED' | 'PRICE' }[] = [
  { id: 'web', label: 'sortFeatured', sort: 'BEST_SELLING', reverse: false, web: true, col: 'COLLECTION_DEFAULT' },
  { id: 'best', label: 'sortBest', sort: 'BEST_SELLING', reverse: false, col: 'BEST_SELLING' },
  { id: 'new', label: 'sortNew', sort: 'CREATED_AT', reverse: true, col: 'CREATED' },
  { id: 'low', label: 'sortPriceLow', sort: 'PRICE', reverse: false, col: 'PRICE' },
  { id: 'high', label: 'sortPriceHigh', sort: 'PRICE', reverse: true, col: 'PRICE' },
];

// Face shape -> recommended frame shapes
export const FACE_MAP: Record<string, { shapes: string[]; tip: Key }> = {
  round: { shapes: ['square', 'rectangle'], tip: 'tipRound' },
  square: { shapes: ['round', 'aviator'], tip: 'tipSquare' },
  oval: { shapes: ['aviator', 'square', 'round'], tip: 'tipOval' },
  heart: { shapes: ['cat', 'round'], tip: 'tipHeart' },
  long: { shapes: ['square', 'aviator'], tip: 'tipLong' },
};
