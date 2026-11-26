#!/bin/sh
set -eu
cd /opt/utm7
umask 077
mkdir -p private
if [ ! -s private/db_password ]; then python3 -c 'import secrets;print(secrets.token_hex(32))' > private/db_password; fi
chmod 700 private
chmod 444 private/db_password
docker compose -p utm7 up -d --build
attempt=0
until docker exec utm7-database pg_isready -U utm7 -d utm7 >/dev/null 2>&1; do
  attempt=$((attempt+1)); [ "$attempt" -lt 40 ] || exit 1; sleep 2
done
docker exec -i utm7-database psql -X -U utm7 -d utm7 -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
SQL
docker exec -i utm7-database psql -X -q -U utm7 -d utm7 -v ON_ERROR_STOP=1 < storage.sql
docker exec -i utm7-database psql -X -q -U utm7 -d utm7 -v ON_ERROR_STOP=1 < own-auth.sql
attempt=0
until docker exec utm7-gateway node -e "fetch('http://127.0.0.1:8080/health').then(r=>r.json()).then(v=>process.exit(v.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  attempt=$((attempt+1)); [ "$attempt" -lt 40 ] || { docker logs --tail 10 utm7-gateway; exit 1; }; sleep 2
done
echo 'UTM7 gateway healthy'

