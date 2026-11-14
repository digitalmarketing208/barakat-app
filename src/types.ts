import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParams = {
  Home: undefined;
  Shop: { query?: string; categoryId?: string; shapeIds?: string[]; title?: string; collection?: string } | undefined;
  TryOn: { handle?: string } | undefined;
  Branches: undefined;
  More: undefined;
};

export type RootParams = {
  Tabs: NavigatorScreenParams<TabParams>;
  Product: { handle: string };
  Cart: undefined;
  Wishlist: undefined;
  Finder: undefined;
  Prescription: undefined;
  Rewards: undefined;
  Plans: undefined;
  ReceiptScan: undefined;
  SignIn: undefined;
  Account: undefined;
  Booking: { branch?: string } | undefined;
  LensGuide: undefined;
};
