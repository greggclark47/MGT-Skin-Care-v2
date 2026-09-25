# MGT Skin Care v2

MGT Skin Care v2 is a skincare guidance and external retailer referral portal. The web app includes Skin Match, explainable routine guidance, product education, saved retailers, and customer support paths. The repository also contains an API, shared domain and AI routing packages, a mobile workspace, infrastructure contracts, tests, and build documentation.

The current shop links to independent retailers. Retailers handle purchases, payments, shipping, and returns. Direct consumer checkout, product payment, fulfillment, and refund flows in this codebase are gated off; see [current scope](CURRENT-SCOPE.md). Local demo data and passing local checks do not establish production readiness.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js web portal |
| `apps/api` | Portal API and local service |
| `apps/mobile` | Mobile workspace and contract checks |
| `packages/domain` | Deterministic matching and routine rules |
| `packages/ai-gateway` | Bounded AI provider routing |
| `packages/shared`, `packages/analytics-sdk` | Shared contracts and analytics client |
| `infra/db`, `infra/portal` | Database migrations, runtime and release verification |

## Build and release evidence

The root pnpm workspace defines `pnpm test:verification` as the local release gate. It builds the packages and app, runs focused behavior and regression checks, exercises the production web proxy journey, and scans the generated public artifact. The latest source-branch comparison and its limits are in [GitHub repository cross-validation](GITHUB-REPOSITORY-CROSS-VALIDATION.md).

Read the [build readiness guide](BUILD-READINESS-GUIDE.md) and [portal operations guide](infra/portal/README.md) before configuring staging or production. Provider credentials, approved catalog data, live identity and database checks, hosted CI, and deployment evidence remain separate requirements. The [infrastructure migration plan](mgt-skincare-ai-infra-migration-v2.md) and [platform blueprint](SkincareAIPlatformBlueprint.md) describe the wider design and open dependencies.
