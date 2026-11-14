import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, font, shadow } from './theme';
import { useI18n } from './i18n';
import type { RootParams, TabParams } from './types';
import HomeScreen from './screens/HomeScreen';
import ShopScreen from './screens/ShopScreen';
import TryOnScreen from './screens/TryOnScreen';
import BranchesScreen from './screens/BranchesScreen';
import MoreScreen from './screens/MoreScreen';
import ProductScreen from './screens/ProductScreen';
import CartScreen from './screens/CartScreen';
import WishlistScreen from './screens/WishlistScreen';
import FinderScreen from './screens/FinderScreen';
import PrescriptionScreen from './screens/PrescriptionScreen';
import BookingScreen from './screens/BookingScreen';
import LensGuideScreen from './screens/LensGuideScreen';
import { SignInScreen, AccountScreen } from './auth';
import PlansScreen from './screens/PlansScreen';
import RewardsRoute from './screens/RewardsRoute';
import ReceiptScanScreen from './receipts/ReceiptScanScreen';

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();

function Tabs() {
  const { t, rtl } = useI18n();
  const order: (keyof TabParams)[] = ['Home', 'Shop', 'TryOn', 'Branches', 'More'];
  const icons: Record<keyof TabParams, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
    Home: ['home', 'home-outline'], Shop: ['glasses', 'glasses-outline'], TryOn: ['camera', 'camera-outline'],
    Branches: ['location', 'location-outline'], More: ['menu', 'menu-outline'],
  };
  const labels: Record<keyof TabParams, string> = {
    Home: t('tabHome'), Shop: t('tabShop'), TryOn: t('tabTryOn'), Branches: t('tabBranches'), More: t('tabMore'),
  };
  const screens: Record<keyof TabParams, React.ComponentType> = { Home: HomeScreen, Shop: ShopScreen, TryOn: TryOnScreen, Branches: BranchesScreen, More: MoreScreen };
  // Tab order is reversed for Arabic so Home sits on the right.
  const list = rtl ? [...order].reverse() : order;
  return (
    // No `key` here: remounting on a language switch reset every tab (Shop filters, scroll position).
    // Changing the order of the screens is enough; the tab router keeps each route's key and state.
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarStyle: { height: Platform.OS === 'ios' ? 88 : 68, paddingTop: 6, backgroundColor: '#fff', borderTopWidth: 0, ...shadow },
        tabBarIcon: ({ focused, color }) => {
          if (route.name === 'TryOn') {
            return (
              <View style={s.fab}><Ionicons name={focused ? 'camera' : 'camera-outline'} size={26} color="#fff" /></View>
            );
          }
          return <Ionicons name={icons[route.name][focused ? 0 : 1]} size={22} color={color} />;
        },
        tabBarLabel: route.name === 'TryOn' ? '' : labels[route.name],
      })}>
      {list.map((n) => <Tab.Screen key={n} name={n} component={screens[n]} options={{ title: labels[n] }} />)}
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { rtl } = useI18n();
  return (
    <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.red } }}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: rtl ? 'slide_from_left' : 'slide_from_right' }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Product" component={ProductScreen} />
        <Stack.Screen name="Cart" component={CartScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Wishlist" component={WishlistScreen} />
        <Stack.Screen name="Finder" component={FinderScreen} />
        <Stack.Screen name="Prescription" component={PrescriptionScreen} />
        <Stack.Screen name="Booking" component={BookingScreen} />
        <Stack.Screen name="LensGuide" component={LensGuideScreen} />
        <Stack.Screen name="Rewards" component={RewardsRoute} />
        <Stack.Screen name="Plans" component={PlansScreen} />
        <Stack.Screen name="ReceiptScan" component={ReceiptScanScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Account" component={AccountScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  fab: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', marginTop: -22, ...shadow },
});
