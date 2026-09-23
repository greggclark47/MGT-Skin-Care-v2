# GitHub repository cross-validation

Revision: 2026-09-22 (America/New_York)

## Decision

`greggclark47/MGT-Skin-Care-v2` is an initial repository placeholder, not a second implementation of the portal. Its `main` branch has one two-line `README.md` and no application, infrastructure, tests, or CI files. There is therefore no feature code from that repository to merge into the working build.

The working portal remains in `greggclark47/MGT-Skin-Care-ChatGPT-Web-Portal-Build-V2.5`, branch `codex/reconcile-main-2026-09-20`. No application files, branding, routes, tests, or configuration were changed by this assessment. The target repository was not written to.

## Repository snapshots

| Repository and ref | Commit | Tracked files | Relevant structure |
| --- | --- | ---: | --- |
| [Working portal branch](https://github.com/greggclark47/MGT-Skin-Care-ChatGPT-Web-Portal-Build-V2.5/tree/codex/reconcile-main-2026-09-20) | `bea824f37dc607574cc567826ae3c4300de213c6` | 281 | `apps/api`, `apps/web`, `apps/mobile`, `packages/domain`, `packages/ai-gateway`, `packages/shared`, `packages/analytics-sdk`, `infra`, `.github/workflows/verification.yml`, root pnpm workspace |
| [Working repository `main`](https://github.com/greggclark47/MGT-Skin-Care-ChatGPT-Web-Portal-Build-V2.5/tree/main) | `6b059566` | Earlier baseline | 47 commits behind the working branch at this assessment; not the latest validated build |
| [Linked repository `main`](https://github.com/greggclark47/MGT-Skin-Care-v2/tree/main) | `d739f3514e4de7fc9f27dbcd1378f2ece6d491e6` | 1 | `README.md` only: “MGT-Skin-Care-v2 / New Fable Build - MGT Skin Care v2” |

The working tree includes seven versioned SQL files under `infra/db/migrations` (`0000`–`0006`) and a local verification entry point at `infra/portal/verify.cjs`. The current product boundary is described in [`CURRENT-SCOPE.md`](CURRENT-SCOPE.md): external retailer referrals are active; direct consumer checkout and product payment flows are gated off. The older root README should not override that scope.

## Merge applicability

- The two repositories have **unrelated Git histories**: `git merge-base HEAD mgt-v2/main` found no common commit. An ordinary fast-forward or direct history-based merge is unavailable.
- A read-only `git merge-tree --write-tree --allow-unrelated-histories --name-only HEAD mgt-v2/main` simulation reported one `README.md` add/add conflict. There are no other target files to reconcile.
- Merging the target into the working branch would add no application capability. Replacing the working tree with the target tree would discard the portal and must not be treated as a migration.
- If `MGT-Skin-Care-v2` is intended to become the canonical repository, create a dedicated integration branch **from its `main`**, bring in the validated working branch with explicit unrelated-history handling, resolve the README to describe the actual referral portal, review the complete imported diff, run the full release gate, and open a pull request into the target `main`. Preserve both histories and existing application assets. Do not use the working repository's older `main` as the import source.
- Whether the linked repository is intended as the canonical destination or a separate future “Fable” project remains an owner decision. The README alone does not resolve this.

## Verification and limits

The working branch's full local verifier, `node infra/portal/verify.cjs`, passed at the source commit above. The run covered package/API builds, web render and smoke checks, domain and gateway checks, HTTP/persistence/release regressions, production web build, a proxy journey, and the generated public artifact scan. Local evidence: `work/verification/2026-09-23T02-46-39-890Z/report.md` (ignored local output).

This proves the present checkout passed its local fixture-based gate. It does **not** verify a merged target branch, live providers, production data, hosted CI, deployment, or production readiness. GitHub's commit-status endpoint returned no status contexts for either snapshot; no CI result is claimed here. Any future integration into the linked repository needs a fresh verification run on that integration branch and the environment-dependent checks in [`BUILD-READINESS-GUIDE.md`](BUILD-READINESS-GUIDE.md).

## Connection

The linked repository is configured locally as the `mgt-v2` Git remote, with `mgt-v2/main` fetched for comparison. `origin` remains the working portal repository. Adding this remote changed only local Git configuration and did not alter either repository's source tree.
