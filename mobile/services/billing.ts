import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { getDeviceId } from '@/services/apiAuth';

export type BillingPlan = 'weekly' | 'quarterly';
export const PREMIUM_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'Pro';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';
const PRODUCT_IDS: Record<BillingPlan, string> = {
  weekly: process.env.EXPO_PUBLIC_REVENUECAT_WEEKLY_PRODUCT_ID || 'fxsnap_premium_weekly',
  quarterly: process.env.EXPO_PUBLIC_REVENUECAT_QUARTERLY_PRODUCT_ID || 'fxsnap_premium_3months',
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

export interface PlanOffering {
  plan: BillingPlan;
  title: string;
  price: string;
  period: string;
  productId: string;
  available: boolean;
}

export function billingIsConfigured() {
  const key = configuredKey();
  return Boolean(key && !key.startsWith('replace_') && !key.startsWith('REPLACE_'));
}

export async function configureBilling(): Promise<boolean> {
  if (!billingIsConfigured()) return false;
  if (!configured) {
    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    await Purchases.configure({ apiKey: configuredKey(), appUserID: await getDeviceId() });
    configured = true;
  }
  return true;
}

export async function getPremiumStatus(): Promise<boolean> {
  if (!(await configureBilling())) return false;
  const customerInfo = await Purchases.getCustomerInfo();
  return hasPremium(customerInfo);
}

async function findPackage(plan: BillingPlan): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;
  const productId = PRODUCT_IDS[plan];
  console.log('Looking for package:', plan);
  console.log('Available packages:', current.availablePackages.map((pkg) => pkg.identifier));
  return current.availablePackages.find(
    (pkg) => pkg.identifier === plan || pkg.product.identifier === productId
  ) || null;
}

export async function getAvailablePlans(): Promise<PlanOffering[]> {
  if (!(await configureBilling())) return [];
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  const fallback = Object.entries(PRODUCT_IDS).map(([plan, productId]) => ({
    plan: plan as BillingPlan,
    title: plan === 'weekly' ? 'Weekly' : '3 Months',
    price: plan === 'weekly' ? '$7.99' : '$29.99',
    period: plan === 'weekly' ? '/ week' : '/ 3 months',
    productId,
    available: false,
  }));

  if (!current) return fallback;

  return Object.entries(PRODUCT_IDS).map(([plan, productId]) => {
    const selected = current.availablePackages.find(
      (pkg) => pkg.identifier === plan || pkg.product.identifier === productId
    );
    return {
      plan: plan as BillingPlan,
      title: selected?.product.title || (plan === 'weekly' ? 'Weekly' : '3 Months'),
      price: selected?.product.priceString || (plan === 'weekly' ? '$7.99' : '$29.99'),
      period: selected?.product.subscriptionPeriod || (plan === 'weekly' ? '/ week' : '/ 3 months'),
      productId,
      available: Boolean(selected),
    };
  });
}

export async function purchasePlan(plan: BillingPlan): Promise<boolean> {
  if (!(await configureBilling())) return false;
  const selectedPackage = await findPackage(plan);
  if (!selectedPackage) throw new Error(`RevenueCat package is not configured for the ${plan} plan.`);
  const purchaseResult = await Purchases.purchasePackage(selectedPackage) as any;
  const customerInfo = purchaseResult.customerInfo ?? purchaseResult.purchaserInfo;
  return customerInfo ? hasPremium(customerInfo) : false;
}

export async function restorePurchases(): Promise<boolean> {
  if (!(await configureBilling())) return false;
  const purchaserInfo = await Purchases.restorePurchases();
  return hasPremium(purchaserInfo);
}

export function addBillingListener(listener: (active: boolean) => void) {
  if (!configured) return () => undefined;
  const callback = (info: CustomerInfo) => listener(hasPremium(info));
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener(callback);
}
