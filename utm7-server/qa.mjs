import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { pool } from "./db.mjs";
import { createService } from "./service.mjs";
import { hashPassword, digest } from "./passwords.mjs";
const file = "/tmp/utm7-qa.json",
  service = createService(pool);
const cleanup = async () => {
  let q;
  try {
    q = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return;
  }
  if (!q.email?.endsWith("@utm7.invalid")) throw Error("Invalid QA record");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const t of ["own_sessions", "own_activations"])
      await c.query(`DELETE FROM utm7.${t} WHERE user_id=$1`, [q.id]);
    await c.query("DELETE FROM utm7.own_users WHERE id=$1 AND email=$2", [q.id, q.email]);
    await c.query("DELETE FROM utm7.admin_identities WHERE user_id=$1", [q.id]);
    await c.query("DELETE FROM utm7.own_login_attempts WHERE email=$1", [q.email]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  await unlink(file);
};
try {
  if (process.argv[2] === "cleanup") {
    await cleanup();
    console.log(JSON.stringify({ cleanup: true }));
  } else if (process.argv[2] === "credentials") {
    process.stdout.write(await readFile(file, "utf8"));
  } else {
    await cleanup();
    const q = {
      id: randomUUID(),
      email: `qa-${randomBytes(8).toString("hex")}@utm7.invalid`,
      password: randomBytes(24).toString("hex"),
    };
    await writeFile(file, JSON.stringify(q), { mode: 0o600 });
    await pool.query(
      "INSERT INTO utm7.own_users(id,email,full_name,password_hash) VALUES($1,$2,'QA temporário',$3)",
      [q.id, q.email, await hashPassword(q.password)],
    );
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await service.auth({ action: "login", email: q.email, password: "incorrect" })).status,
        401,
      );
    assert.equal(
      (await service.auth({ action: "login", email: q.email, password: q.password })).status,
      429,
    );
    await pool.query("DELETE FROM utm7.own_login_attempts WHERE email=$1", [q.email]);
    const logged = await service.auth({ action: "login", email: q.email, password: q.password });
    assert.equal(logged.ok, true);
    assert.equal(
      (await service.auth({ action: "session", token: logged.data.token })).data.user.id,
      q.id,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::integer AS n FROM utm7.own_sessions WHERE token_hash=$1",
          [logged.data.token],
        )
      ).rows[0].n,
      0,
    );
    await pool.query(
      "UPDATE utm7.own_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [digest(logged.data.token)],
    );
    assert.equal((await service.auth({ action: "session", token: logged.data.token })).status, 401);
    const next = await service.auth({ action: "login", email: q.email, password: q.password });
    await service.auth({ action: "logout", token: next.data.token });
    assert.equal((await service.auth({ action: "session", token: next.data.token })).status, 401);
    const roleSession = await service.auth({
      action: "login",
      email: q.email,
      password: q.password,
    });
    await pool.query("UPDATE utm7.own_users SET is_admin=false WHERE id=$1", [q.id]);
    assert.equal(
      (
        await service.operation({
          operation: "dispatch",
          token: roleSession.data.token,
          payload: { action: "dashboard" },
        })
      ).response.status,
      401,
    );
    await pool.query("UPDATE utm7.own_users SET is_admin=true WHERE id=$1", [q.id]);
    const legacy = (
      await pool.query("SELECT public.crypt($1,public.gen_salt('bf',6)) AS h", [q.password])
    ).rows[0].h;
    await pool.query("UPDATE utm7.own_users SET password_hash=$1 WHERE id=$2", [legacy, q.id]);
    const migrated = await service.auth({ action: "login", email: q.email, password: q.password });
    assert.equal(migrated.ok, true);
    assert.match(
      (await pool.query("SELECT password_hash FROM utm7.own_users WHERE id=$1", [q.id])).rows[0]
        .password_hash,
      /^scrypt\$/,
    );
    const unauthorized = await service.operation({
      operation: "dispatch",
      token: "a".repeat(64),
      payload: { action: "dashboard", user_id: q.id, authorized: true },
    });
    assert.equal(unauthorized.response.status, 401);
    console.log(
      JSON.stringify({
        ok: true,
        checks: [
          "password",
          "rate_limit",
          "token_hash",
          "expiry",
          "logout",
          "role_recheck",
          "bcrypt_upgrade",
          "forged_identity",
        ],
        qa_ready: true,
      }),
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

