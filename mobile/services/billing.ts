import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { getDeviceId } from '@/services/apiAuth';

export type BillingPlan = 'weekly' | 'quarterly';
export const PREMIUM_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || 'Pro';

const IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY || '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || '';
const PRODUCT_IDS: Record<BillingPlan, string[]> = {
  weekly: [
    process.env.EXPO_PUBLIC_REVENUECAT_WEEKLY_PRODUCT_ID || 'fxsnap_premium_weekly',
    'fxsnap_weekly',
  ],
  quarterly: [
    process.env.EXPO_PUBLIC_REVENUECAT_QUARTERLY_PRODUCT_ID || 'fxsnap_premium_3months',
    'fxsnap_quarterly',
  ],
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

function formatSubscriptionPeriod(product: any, plan: BillingPlan) {
  const period = product?.subscriptionPeriod;
  if (!period || typeof period !== 'object') {
    return plan === 'weekly' ? 'week' : '3 months';
  }

  const unit = period.unit?.toLowerCase?.();
  const numberOfUnits = period.numberOfUnits ?? 1;
  if (unit === 'week' || unit === 'weeks') return `${numberOfUnits} week${numberOfUnits === 1 ? '' : 's'}`;
  if (unit === 'month' || unit === 'months') return `${numberOfUnits} month${numberOfUnits === 1 ? '' : 's'}`;
  if (unit === 'year' || unit === 'years') return `${numberOfUnits} year${numberOfUnits === 1 ? '' : 's'}`;
  return plan === 'weekly' ? 'week' : '3 months';
}

function planMatchesPackage(plan: BillingPlan, pkg: PurchasesPackage): boolean {
  const productIds = PRODUCT_IDS[plan].map((id) => id.toLowerCase());
  const identifier = pkg.identifier?.toLowerCase?.() ?? '';
  const productIdentifier = pkg.product?.identifier?.toLowerCase?.() ?? '';

  if (identifier === plan || productIdentifier === plan) return true;
  if (productIds.includes(productIdentifier)) return true;
  if (plan === 'quarterly' && (identifier.includes('three') || productIdentifier.includes('three') || identifier.includes('3') || productIdentifier.includes('3'))) return true;
  if (plan === 'weekly' && (identifier.includes('week') || productIdentifier.includes('week'))) return true;
  return false;
}

async function findPackage(plan: BillingPlan): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;
  const packageMatch = current.availablePackages.find((pkg) => planMatchesPackage(plan, pkg));
  console.log('Looking for package:', plan);
  console.log('Available packages:', current.availablePackages.map((pkg) => ({ identifier: pkg.identifier, product: pkg.product.identifier })));
  return packageMatch || null;
}

export async function getAvailablePlans(): Promise<PlanOffering[]> {
  if (!(await configureBilling())) return [];
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;

  if (!current) return [];

  return Object.entries(PRODUCT_IDS).map(([planKey, productIds]) => {
    const plan = planKey as BillingPlan;
    const selected = current.availablePackages.find((pkg) => planMatchesPackage(plan, pkg));
    const product = selected?.product;
    return {
      plan,
      title: plan === 'weekly' ? 'Weekly' : '3 Months',
      price: product?.priceString || '—',
      period: formatSubscriptionPeriod(product, plan),
      productId: product?.identifier || productIds[0],
      available: Boolean(selected),
    };
  });
}

export async function purchasePlan(plan: BillingPlan): Promise<boolean> {
  if (!(await configureBilling())) return false;
  const selectedPackage = await findPackage(plan);
  if (!selectedPackage) throw new Error(`RevenueCat package is not configured for the ${plan} plan.`);

  try {
    const purchaseResult = await Purchases.purchasePackage(selectedPackage) as any;
    const customerInfo = purchaseResult.customerInfo ?? purchaseResult.purchaserInfo;
    return customerInfo ? hasPremium(customerInfo) : false;
  } catch (error: unknown) {
    const err = error as any;
    if (err?.userCancelled || err?.code === 'PURCHASE_CANCELLED') {
      return false;
    }
    console.error('RevenueCat purchase failed:', error);
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!(await configureBilling())) return false;
  const purchaserInfo = await Purchases.restorePurchases();
  return hasPremium(purchaserInfo);
}

export function addBillingListener(listener: (active: boolean) => void) {
  const callback = (info: CustomerInfo) => listener(hasPremium(info));
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener(callback);
}
