#!/bin/sh
set -eu
umask 077
cd /opt/utm7
mkdir -p private/backups
target="private/backups/utm7-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec utm7-database pg_dump -U utm7 -d utm7 -Fc > "$target.tmp"
test -s "$target.tmp"
mv "$target.tmp" "$target"
docker exec -i utm7-database pg_restore --list < "$target" >/dev/null
find /opt/utm7/private/backups -maxdepth 1 -type f -name 'utm7-*.dump' -mtime +14 -delete
printf 'UTM7 backup verified\n'

