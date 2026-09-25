# MGT Skin Care mobile surface

The mobile Skin Match screen reuses the shared questionnaire, profile conversion, design tokens, and API client from the workspace. Its contract gate runs without requiring a simulator or provider credentials:

```text
pnpm --filter @mgt/mobile test:contract
```

For an Expo development session, configure `EXPO_PUBLIC_API_URL` in the mobile environment before starting Expo. The mobile client must use the same-origin or approved staging API endpoint; it must not receive server-side provider keys.

The contract gate does not claim a device build or store readiness. Those still require an approved Expo toolchain, simulator/device, authentication configuration, and a staging API.
