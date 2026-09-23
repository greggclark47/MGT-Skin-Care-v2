# Connected portal phase — September 6, 2026

## Available in the local preview
- Skin Match collects ingredient exclusions and explicit saving consent before generating a sample routine.
- Profiles, routine changes, bags, reminders and support requests use the portal API and SQLite storage, rather than browser sessionStorage.
- Guest profiles are linked to a 24-hour cookie session. They are not a permanent signed-in account.
- Morning/evening routine tabs, confirmed simplification, sample catalog filters, bag quantities and reminder removal are connected.
- Sign-in, order status, knowledge and coach screens use the new API and show unavailable-service states when configuration is missing.
- Reminders are in-portal records. No email, push notification, automatic replenishment purchase or external support delivery is enabled.
- Sample products cannot be purchased.

## Validation completed
- API compilation, web production build and existing web/admin rendering checks passed.
- Integration checks passed for session isolation, CSRF and origin rejection, saved profiles, sample matching, bag validation, unique routine bag items, reminder isolation/removal, support isolation and transaction rollback.
- Server-side quote totals equal the line items that would be sent to Stripe, including member discounts.
- Forged administration identity headers were rejected by the new API.
- These are local checks. Live authentication, payment webhooks, transfers, external models, production PostgreSQL and browser interaction tests have not been verified.

## Remaining work before launch
The original administration screens still require migration to the verified session API. Operational provisioning, granular administration access, payment reconciliation/recovery, data deletion execution, retention cleanup, production hosting integration, and complete provider contract tests remain outstanding. Company details, published policies, approved catalog and ingredient data, reviewed educational content, and service credentials must be supplied or reviewed before launch.

The previous VISUAL-UPGRADE.md describes the earlier visual-only checkpoint. This file supersedes its pending phase4-server and legacy customer-screen notes. No production deployment has occurred.

