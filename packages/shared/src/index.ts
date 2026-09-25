// @mgt/shared — the cross-platform layer consumed by BOTH apps/web and apps/mobile.
// Section C.1: "no separate business logic per platform" is enforced by this package
// existing, rather than by convention. Nothing here may import react-dom or react-native.
export * from './tokens';
export * from './questionnaire';
export * from './api';
export * from './admin-api';
export * from './subscription-api';
