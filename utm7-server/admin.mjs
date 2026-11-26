import { pool } from "./db.mjs";
import { newToken, digest } from "./passwords.mjs";
const [command, id, email, name] = process.argv.slice(2);
try {
  if (command !== "activate" || !/^[a-f0-9-]{36}$/.test(id || "") || !email)
    throw Error("Use activate USER_ID EMAIL NAME");
  const token = newToken();
  await pool.query(
    "INSERT INTO utm7.own_users(id,email,full_name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
    [id, email.toLowerCase(), name || email],
  );
  // Reissuing a setup link invalidates previous unused links, not existing sessions.
  await pool.query(
    "UPDATE utm7.own_activations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
    [id],
  );
  await pool.query(
    "INSERT INTO utm7.own_activations(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
    [digest(token), id],
  );
  console.log(JSON.stringify({ activation_token: token, expires_in_hours: 8 }));
} finally {
  await pool.end();
}

