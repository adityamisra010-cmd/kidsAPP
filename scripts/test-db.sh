#!/usr/bin/env bash
# =============================================================================
# npm run test:db — RLS, metrics-parity and RPC tests against a real Postgres, no Docker.
#
# 1. Uses $DATABASE_URL if set (must be an EMPTY, disposable database: the script installs
#    a Supabase shim and all migrations into it). Otherwise creates a throwaway cluster with
#    the local Postgres server binaries (initdb/pg_ctl, PG >= 15) on a free port.
# 2. Loads scripts/db/shim.sql (auth/storage/roles), supabase/migrations/*.sql in order and
#    scripts/db/fixtures.sql.
# 3. Runs scripts/db/run-tests.ts (tsx). Exit code is non-zero on any failure.
# The temporary cluster is always stopped and deleted.
#
# Pass --write-fixtures to regenerate src/domain/__fixtures__/metrics-cases.json from
# src/domain/metrics.ts.
#
# Pass --seed (npm run test:db:seed) to check the demo seed instead of running the tests:
# shim + migrations, then scripts/generate-seed-sql.ts writes a fresh seed.sql to a temp file
# (supabase/seed.sql is left untouched) and scripts/db/seed-check.ts loads it twice and runs the
# sanity checks (row counts, logins, persona RLS, metrics). No test fixtures are loaded.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP=""
SEED_TMP=""
PG_BIN=""
RUN_AS=()

SEED=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done

cleanup() {
  local code=$?
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then
    if [ -f "$TMP/data/postmaster.pid" ]; then
      "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
    fi
    rm -rf "$TMP"
  fi
  if [ -n "$SEED_TMP" ] && [ -d "$SEED_TMP" ]; then
    rm -rf "$SEED_TMP"
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

find_pg_bin() {
  if command -v pg_config >/dev/null 2>&1 && [ -x "$(pg_config --bindir)/initdb" ]; then
    pg_config --bindir
    return
  fi
  local candidate
  candidate="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -n "$candidate" ] && [ -x "$candidate/initdb" ]; then
    echo "$candidate"
    return
  fi
  if command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v initdb)"
    return
  fi
  echo "No Postgres server binaries found (initdb/pg_ctl). Install PostgreSQL >= 15 or set DATABASE_URL." >&2
  exit 1
}

free_port() {
  node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"
}

if [ -z "${DATABASE_URL:-}" ]; then
  PG_BIN="$(find_pg_bin)"
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/mkt-testdb.XXXXXX")"
  chmod 755 "$TMP"
  # Postgres refuses to run as root: use the `postgres` system user when we are root.
  if [ "$(id -u)" = "0" ]; then
    if id postgres >/dev/null 2>&1; then
      chown postgres "$TMP"
      RUN_AS=(runuser -u postgres --)
    else
      echo "Running as root and no 'postgres' user exists; run as a normal user or set DATABASE_URL." >&2
      exit 1
    fi
  fi
  PORT="$(free_port)"
  echo "› temporary Postgres $("$PG_BIN/postgres" --version | awk '{print $3}') on port $PORT"
  "${RUN_AS[@]}" "$PG_BIN/initdb" -D "$TMP/data" -A trust -U postgres --no-sync -E UTF8 >"$TMP/initdb.log" 2>&1 \
    || { cat "$TMP/initdb.log"; exit 1; }
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -l "$TMP/server.log" -w \
    -o "-p $PORT -k $TMP -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
    start >/dev/null || { cat "$TMP/server.log"; exit 1; }
  export DATABASE_URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
fi

PSQL="psql"
if ! command -v psql >/dev/null 2>&1; then
  PSQL="${PG_BIN:-$(find_pg_bin)}/psql"
fi
export PGOPTIONS="-c client_min_messages=warning"
run_sql() {
  "$PSQL" "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$1" >/dev/null
}

echo "› shim"
run_sql scripts/db/shim.sql
for f in supabase/migrations/*.sql; do
  echo "› $(basename "$f")"
  run_sql "$f"
done
if [ "$SEED" = "1" ]; then
  SEED_TMP="$(mktemp -d "${TMPDIR:-/tmp}/mkt-seed.XXXXXX")"
  echo "› generate seed.sql"
  npx tsx scripts/generate-seed-sql.ts --out "$SEED_TMP/seed.sql"
  echo "› seed checks"
  npx tsx scripts/db/seed-check.ts "$SEED_TMP/seed.sql"
  exit 0
fi

echo "› fixtures"
run_sql scripts/db/fixtures.sql

echo "› tests"
npx tsx scripts/db/run-tests.ts ${ARGS[@]+"${ARGS[@]}"}
