#!/usr/bin/env bash
# Reset a local Postgres to a freshly-migrated state and run the database-backed smoke tests.
#
# The Postgres smoke tests use fixed fixture ids (evt_live_1, order_live_1, kb-*, ...) and are
# NOT idempotent: running them twice against the same database fails on duplicate keys, which
# looks like a code regression and is not one. They are written to assert against a known
# starting state, so the reset is part of the test, not a convenience.
#
# Usage:  infra/db/reset-and-test.sh [--reset-only]
#
# Expects a Postgres reachable on the socket the tests hard-code:
#   host=/tmp  port=5499  user=postgres  db=postgres
# Start one with:
#   initdb -D <datadir> -U postgres --auth=trust
#   pg_ctl -D <datadir> -o '-p 5499 -k /tmp -c listen_addresses=' start
# Requires the `vector` and `pg_cron` extensions to be installed for 0001 to apply
# (postgresql-16-pgvector, postgresql-16-cron on Debian/Ubuntu), and pg_cron additionally
# needs shared_preload_libraries='pg_cron' + cron.database_name set in postgresql.conf.

set -euo pipefail

PGHOST=/tmp
PGPORT=5499
PGUSER=postgres
PGDATABASE=postgres
PGOPTIONS="-c client_min_messages=warning"
export PGHOST PGPORT PGUSER PGDATABASE PGOPTIONS

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$ROOT/infra/db/migrations"

echo "==> Resetting database"
psql -v ON_ERROR_STOP=1 -q -c "
  drop schema if exists public cascade;
  drop schema if exists knowledge cascade;
  drop schema if exists analytics cascade;
  drop schema if exists auth cascade;
  create schema public;
" >/dev/null

echo "==> Applying migrations in numeric order"
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  name=$(basename "$f")
  if out=$(psql -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE); [ -n "$out" ]; then
    echo "    FAIL  $name"
    echo "$out" | head -10
    exit 1
  fi
  echo "    ok    $name"
done

if [ "${1:-}" = "--reset-only" ]; then
  echo "==> Reset complete (--reset-only)"
  exit 0
fi

echo "==> Building"
(cd "$ROOT" && pnpm -r build >/dev/null)

# Each test gets its own freshly-migrated database, because they are not idempotent and
# several of them assert on row counts that earlier tests would otherwise have changed.
API="$ROOT/apps/api"
FAILED=0
for t in persistence dual-backend admin-persistence ingredient-rules-persistence; do
  echo ""
  echo "==> $t"
  psql -v ON_ERROR_STOP=1 -q -c "
    drop schema if exists public cascade; drop schema if exists knowledge cascade;
    drop schema if exists analytics cascade; drop schema if exists auth cascade;
    create schema public;" >/dev/null
  for f in $(ls "$MIGRATIONS"/*.sql | sort); do
    psql -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1
  done
  if ! node "$API/dist/__smoke__/$t.js"; then
    FAILED=1
  fi
done

echo ""
if [ $FAILED -eq 0 ]; then
  echo "ALL DATABASE-BACKED SMOKE TESTS PASSED"
else
  echo "SOME DATABASE-BACKED SMOKE TESTS FAILED"
  exit 1
fi
