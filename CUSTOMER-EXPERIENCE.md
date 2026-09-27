# Customer experience improvements — September 6, 2026

## Changes
- Profile updates load saved answers. A review screen shows every answer, with direct edit-and-return navigation before consent and saving.
- Single-choice questions support arrow keys, Home and End. Focus moves to the current question or review heading.
- The bag count updates after successful changes.
- Shop search covers names, ingredients and routine steps; sorting supports both price directions. Empty searches offer a reset.
- Replacing a bag requires confirmation when it contains products. A revision check prevents overwriting a bag changed since confirmation began.
- Customers can remove unavailable or deleted products without losing access to the bag. The latest removal can be undone.
- Bag rows show quantity, unit price and line total. Unavailable service and sign-in states explain why checkout cannot proceed.
- Routine results identify missing eligible products and avoid offering simplification when no optional steps exist.
- Confirmation dialogs use native modal focus handling and keyboard dismissal.
- Connection errors use customer-facing messages. Uncertain writes are not retried automatically; expired request tokens are refreshed for the next attempt.

## Validation
The production web build, API integration checks, existing web/admin rendering checks and client recovery checks passed during this work. Additional API checks cover stale bag revisions, unavailable products and deleted-product removal. Client checks cover renewed session tokens, non-JSON service outages and avoiding automatic duplicate writes.

Browser-based visual and interaction testing has not been performed. These changes do not complete production readiness: live provider validation, administration migration, operational recovery, company policies and hosting work remain as described in CONNECTIONS.md.

