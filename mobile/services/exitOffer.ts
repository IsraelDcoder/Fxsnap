import type { PurchasesPackage, SubscriptionOption } from 'react-native-purchases';

const EXIT_OFFER_ID = 'yearly-exit-20off';

export type YearlyExitOffer = {
  package: PurchasesPackage;
  option: SubscriptionOption;
};

let exitOfferForSession: YearlyExitOffer | null = null;

export function isYearlyExitOfferOption(optionId: string): boolean {
  return optionId === `yearly:${EXIT_OFFER_ID}` || optionId.endsWith(EXIT_OFFER_ID);
}

export function cacheYearlyExitOfferForSession(offer: YearlyExitOffer): void {
  exitOfferForSession = offer;
}

export function getYearlyExitOfferForSession(): YearlyExitOffer | null {
  return exitOfferForSession;
}

export function hasShownYearlyExitOfferThisSession(): boolean {
  return exitOfferForSession !== null;
}

export function isDiscountedFirstYearPrice(
  firstYearPrice: { formatted: string; amountMicros: number } | null | undefined,
  regularYearlyPrice: number,
): boolean {
  return Boolean(
    firstYearPrice?.formatted
    && Number.isFinite(firstYearPrice.amountMicros)
    && Number.isFinite(regularYearlyPrice)
    && firstYearPrice.amountMicros < Math.round(regularYearlyPrice * 1_000_000),
  );
}
