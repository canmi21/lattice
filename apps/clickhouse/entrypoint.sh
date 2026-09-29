#!/bin/bash
# Writes the user ClickHouse serves as, from CLICKHOUSE_USER/CLICKHOUSE_PASSWORD/CLICKHOUSE_DB,
# onto tmpfs -- the root filesystem is read-only, and the credentials are only known at start. See
# spec/architecture/databases.md, "The drivers".
set -euo pipefail

user="${CLICKHOUSE_USER:?entrypoint: CLICKHOUSE_USER is required}"
password="${CLICKHOUSE_PASSWORD:?entrypoint: CLICKHOUSE_PASSWORD is required}"
db="${CLICKHOUSE_DB:-}"

runtime=/tmp/clickhouse-runtime
mkdir -p "$runtime/tmp" "$runtime/user_files" "$runtime/access" "$runtime/format_schemas"

# `access_management` lets the one user create the database below without a second, unmanaged
# superuser; `networks` is open because the sidecar is already alone on its app's own network.
cat >"$runtime/users.xml" <<XML
<clickhouse>
	<profiles>
		<default/>
	</profiles>
	<quotas>
		<default/>
	</quotas>
	<users>
		<$user>
			<password><![CDATA[$password]]></password>
			<profile>default</profile>
			<quota>default</quota>
			<access_management>1</access_management>
			<networks>
				<ip>::/0</ip>
			</networks>
		</$user>
	</users>
</clickhouse>
XML

clickhouse-server --config-file=/etc/clickhouse-server/config.xml &
server=$!

if [ -n "$db" ]; then
	for _ in $(seq 1 30); do
		clickhouse-client --user "$user" --password "$password" --query "SELECT 1" >/dev/null 2>&1 \
			&& break
		sleep 1
	done
	clickhouse-client --user "$user" --password "$password" \
		--query "CREATE DATABASE IF NOT EXISTS \`$db\`"
fi

wait "$server"
