import {
  digest,
  newToken,
  validToken,
  validPassword,
  hashPassword,
  checkPassword,
} from "./passwords.mjs";
const failure = (error, status = 400) => ({ ok: false, error, status });
const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  active: u.active,
  is_admin: u.is_admin,
});
const allowed = (u) => u?.active === true && u?.is_admin === true;
export function createService(pool) {
  async function session(token, client = pool) {
    if (!validToken(token)) return null;
    const r = await client.query(
      "SELECT u.*,s.expires_at FROM utm7.own_sessions s JOIN utm7.own_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active AND u.is_admin",
      [digest(token)],
    );
    return r.rows[0] || null;
  }
  async function issue(client, user) {
    await client.query(
      "DELETE FROM utm7.own_sessions WHERE expires_at<now()-interval '7 days' OR revoked_at<now()-interval '1 day'",
    );
    const token = newToken();
    const r = await client.query(
      "INSERT INTO utm7.own_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours') RETURNING expires_at",
      [digest(token), user.id],
    );
    return { ok: true, data: { user: publicUser(user), token, expires_at: r.rows[0].expires_at } };
  }
  async function auth(p) {
    if (p.action === "session") {
      const u = await session(p.token);
      return u
        ? { ok: true, data: { user: publicUser(u), expires_at: u.expires_at } }
        : failure("Entre no UTM7 para continuar.", 401);
    }
    if (p.action === "logout") {
      if (validToken(p.token))
        await pool.query("UPDATE utm7.own_sessions SET revoked_at=now() WHERE token_hash=$1", [
          digest(p.token),
        ]);
      return { ok: true, data: {} };
    }
    if (!["login", "activate"].includes(p.action)) return failure("Operação inválida.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (p.action === "activate") {
        if (!validToken(p.activation_token) || !validPassword(p.password)) {
          await client.query("ROLLBACK");
          return failure(
            "Informe um acesso de ativação válido e uma senha com 12 a 128 caracteres.",
          );
        }
        const r = await client.query(
          "SELECT a.token_hash,u.* FROM utm7.own_activations a JOIN utm7.own_users u ON u.id=a.user_id WHERE a.token_hash=$1 AND a.used_at IS NULL AND a.expires_at>now() FOR UPDATE OF a,u",
          [digest(p.activation_token)],
        );
        const u = r.rows[0];
        if (!allowed(u)) {
          await client.query("ROLLBACK");
          return failure("O acesso de ativação expirou ou já foi utilizado.", 401);
        }
        await client.query("UPDATE utm7.own_users SET password_hash=$1 WHERE id=$2", [
          await hashPassword(p.password),
          u.id,
        ]);
        await client.query("UPDATE utm7.own_activations SET used_at=now() WHERE token_hash=$1", [
          digest(p.activation_token),
        ]);
        await client.query(
          "UPDATE utm7.own_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [u.id],
        );
        const result = await issue(client, u);
        await client.query("COMMIT");
        return result;
      }
      const email = typeof p.email === "string" ? p.email.trim().toLowerCase().slice(0, 254) : "";
      if (!email || typeof p.password !== "string" || p.password.length > 128) {
        await client.query("ROLLBACK");
        return failure("E-mail ou senha inválidos.", 401);
      }
      const result = await client.query("SELECT * FROM utm7.own_users WHERE email=$1", [email]);
      const u = result.rows[0],
        bucket = u ? email : "__unknown__";
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["utm7-login:" + bucket]);
      await client.query(
        "DELETE FROM utm7.own_login_attempts WHERE window_started_at<now()-interval '1 day'",
      );
      await client.query(
        "INSERT INTO utm7.own_login_attempts(email) VALUES($1) ON CONFLICT DO NOTHING",
        [bucket],
      );
      await client.query(
        "UPDATE utm7.own_login_attempts SET failures=0,window_started_at=now() WHERE email=$1 AND window_started_at<now()-interval '15 minutes'",
        [bucket],
      );
      const attempts = await client.query(
        "SELECT failures FROM utm7.own_login_attempts WHERE email=$1",
        [bucket],
      );
      if (attempts.rows[0].failures >= 5) {
        await client.query("COMMIT");
        return failure("Muitas tentativas. Aguarde 15 minutos e tente novamente.", 429);
      }
      const legacy =
        typeof u?.password_hash === "string" &&
        /^\$2[ab]\$\d\d\$[./A-Za-z0-9]{53}$/.test(u.password_hash);
      const correct =
        legacy && Buffer.byteLength(p.password) <= 72
          ? (
              await client.query("SELECT public.crypt($1,$2)=$2 AS valid", [
                p.password,
                u.password_hash,
              ])
            ).rows[0].valid === true
          : await checkPassword(p.password, legacy ? null : u?.password_hash);
      if (!correct || !allowed(u)) {
        await client.query(
          "UPDATE utm7.own_login_attempts SET failures=failures+1 WHERE email=$1",
          [bucket],
        );
        await client.query("COMMIT");
        return failure("E-mail ou senha inválidos.", 401);
      }
      await client.query("DELETE FROM utm7.own_login_attempts WHERE email=$1", [email]);
      if (legacy && validPassword(p.password))
        await client.query("UPDATE utm7.own_users SET password_hash=$1 WHERE id=$2", [
          await hashPassword(p.password),
          u.id,
        ]);
      const issued = await issue(client, u);
      await client.query("COMMIT");
      return issued;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async function operation(p) {
    const u = await session(p.token);
    if (!u) return { user_id: "", response: failure("Entre no UTM7 para continuar.", 401) };
    await pool.query(
      "INSERT INTO utm7.admin_identities(user_id,active,verified_at) VALUES($1,true,now()) ON CONFLICT(user_id) DO UPDATE SET active=true,verified_at=now()",
      [u.id],
    );
    let sql, values;
    if (p.operation === "dispatch") {
      sql = "SELECT utm7.dispatch($1,$2::jsonb) AS response";
      values = [u.id, JSON.stringify(p.payload || {})];
    } else if (p.operation === "save_report") {
      sql = "SELECT utm7.save_report($1,$2::uuid,$3::date,$4::date,$5::jsonb) AS response";
      values = [u.id, p.connection_id, p.since, p.until, JSON.stringify(p.payload || {})];
    } else if (p.operation === "finish_budget") {
      sql = "SELECT utm7.finish_budget($1,$2::uuid,$3::boolean) AS response";
      values = [u.id, p.request_id, p.success === true];
    } else if (p.operation === "finish_status") {
      sql = "SELECT utm7.finish_status($1,$2::uuid,$3::boolean,$4) AS response";
      values = [
        u.id,
        p.request_id,
        p.success === true,
        String(p.previous_status || "").slice(0, 60),
      ];
    } else return { user_id: u.id, response: failure("Operação inválida.") };
    const r = await pool.query(sql, values);
    return { user_id: u.id, response: r.rows[0].response };
  }
  return { auth, operation, session };
}

