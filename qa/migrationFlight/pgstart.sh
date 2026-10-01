#!/bin/bash
# Start a throwaway PG16 cluster on port 7200, socket + data in /tmp/r3mig-pg
set -e
D=/tmp/r3mig-pg
S=$(cd "$(dirname "$0")" && pwd)
if [ "$1" = "stop" ]; then
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D/data -m immediate stop" || true
  rm -rf $D
  exit 0
fi
rm -rf $D; mkdir -p $D; chown postgres:postgres $D
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $D/data -U postgres -A trust >/dev/null"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D/data -o '-p 7200 -k $D -c listen_addresses= -c max_connections=300' -l $D/log -w start"
psql -h $D -p 7200 -U postgres -d postgres -tAq -v ON_ERROR_STOP=1 -f $S/roles.sql
psql -h $D -p 7200 -U postgres -tAc "select version()"
