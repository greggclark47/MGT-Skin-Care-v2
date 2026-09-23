// @mgt/analytics-sdk — event taxonomy client (Section K: domain.action naming,
// privacy_class, retention_class, identity stitching).
// Keep the package entrypoint explicit so web, mobile and server callers share one contract.
export * from './taxonomy';
export * from './client';

export const ANALYTICS_SDK_VERSION = '0.2.0';
