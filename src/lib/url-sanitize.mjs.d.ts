export const TRACKING_PARAM_NAMES: Set<string>;
export const OUTBOUND_REFERRAL_PARAM_SKIP_HOSTS: string[];
export function isTrackingParamName(name: string, url?: URL): boolean;
export function shouldSkipFountainReferralParams(value: string | null | undefined): boolean;
export function isGoogleSerpRedirectWrapper(value: string | null | undefined): boolean;
export function extractGoogleSerpRedirectTarget(value: string | null | undefined): string | null;
export function sanitizeUrl(value: string | null | undefined): string | null;
export function addFountainReferralParams(value: string | null | undefined): string | null;
export function containsTrackingParams(value: string | null | undefined): boolean;
