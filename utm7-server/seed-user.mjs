import { pool } from "./db.mjs";
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const u = JSON.parse(raw);
try {
  if (
    !/^[a-f0-9-]{36}$/.test(u.id || "") ||
    !/^\$2[ab]\$\d\d\$[./A-Za-z0-9]{53}$/.test(u.password_hash || "") ||
    u.active !== true ||
    u.is_admin !== true
  )
    throw Error("Invalid authorized user");
  await pool.query(
    "INSERT INTO utm7.own_users(id,email,full_name,password_hash,active,is_admin) VALUES($1,$2,$3,$4,true,true) ON CONFLICT(id) DO NOTHING",
    [u.id, u.email.toLowerCase(), u.full_name, u.password_hash],
  );
  const r = await pool.query(
    "SELECT md5(password_hash)=$2 AS verified FROM utm7.own_users WHERE id=$1",
    [u.id, u.fingerprint],
  );
  if (r.rows[0]?.verified !== true) throw Error("User hash verification failed");
  console.log(JSON.stringify({ ok: true, password_hash_verified: true }));
} finally {
  await pool.end();
}

