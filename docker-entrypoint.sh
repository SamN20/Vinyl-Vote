#!/bin/sh
set -e

mkdir -p /app/data
chown -R app:app /app/data

if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  set +e
  MIGRATION_OUTPUT=$(gosu app flask --app run.py db upgrade 2>&1)
  MIGRATION_STATUS=$?
  set -e

  if [ "$MIGRATION_STATUS" -ne 0 ]; then
    echo "$MIGRATION_OUTPUT" >&2
    echo "Migration failed on startup; continuing app boot to preserve availability." >&2
  fi
fi

exec gosu app "$@"