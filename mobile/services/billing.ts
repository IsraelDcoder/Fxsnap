import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { getDeviceId, getServerPremiumStatus } from '@/services/apiAuth';

export type BillingPlan = 'weekly' | 'quarterly';
export const PREMIUM_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'premium';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';
const PRODUCT_IDS: Record<BillingPlan, string> = {
  weekly: process.env.EXPO_PUBLIC_REVENUECAT_WEEKLY_PRODUCT_ID || 'fxsnap_weekly',
  quarterly: process.env.EXPO_PUBLIC_REVENUECAT_QUARTERLY_PRODUCT_ID || 'fxsnap_quarterly',
};

let configured = false;

function configuredKey() {
  if (Platform.OS === 'ios') return IOS_KEY;
  if (Platform.OS === 'android') return ANDROID_KEY;
  return '';
}

function hasPremium(info: CustomerInfo) {
  return Boolean(info.entitlements.active[PREMIUM_ENTITLEMENT_ID]);
}

export function billingIsConfigured() {
  const key = configuredKey();
  return Boolean(key && !key.startsWith('replace_') && !key.startsWith('REPLACE_'));
}

export async function configureBilling(): Promise<boolean> {
  if (!billingIsConfigured()) return false;
  if (!configured) {
    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({ apiKey: configuredKey(), appUserID: await getDeviceId() });
    configured = true;
  }
  return true;
}

export async function getPremiumStatus(): Promise<boolean> {
  if (!(await configureBilling())) return false;
  await Purchases.getCustomerInfo();
  const serverStatus = await getServerPremiumStatus();
  return serverStatus === true;
}

async function findPackage(plan: BillingPlan): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;
  const productId = PRODUCT_IDS[plan];
  return current.availablePackages.find((item) => item.product.identifier === productId || item.identifier === productId) || null;
}

export async function purchasePlan(plan: BillingPlan): Promise<boolean> {
  if (!(await configureBilling())) return false;
  const selectedPackage = await findPackage(plan);
  if (!selectedPackage) throw new Error(`RevenueCat package is not configured for the ${plan} plan.`);
  await Purchases.purchasePackage(selectedPackage);
  const serverStatus = await getServerPremiumStatus();
  return serverStatus === true;
}

export async function restorePurchases(): Promise<boolean> {
  if (!(await configureBilling())) return false;
  await Purchases.restorePurchases();
  const serverStatus = await getServerPremiumStatus();
  return serverStatus === true;
}

export function addBillingListener(listener: (active: boolean) => void) {
  if (!configured) return () => undefined;
  const callback = (info: CustomerInfo) => listener(hasPremium(info));
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener(callback);
}
