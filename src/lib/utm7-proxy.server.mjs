const BASE = "https://projetopessoal-n8n.h574he.easypanel.host/webhook/m7-utm7/vps/";
const tokenPattern = /^[a-f0-9]{64}$/;
const actions = new Set([
  "dashboard",
  "save_offer",
  "save_connection",
  "sync_meta",
  "prepare_budget",
  "prepare_status",
]);
function json(body, status = 200, cookie) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(JSON.stringify(body), { status, headers });
}
function publicSession(data) {
  const u = data?.user;
  if (!u || u.active !== true || u.is_admin !== true || !/^[a-f0-9-]{36}$/i.test(u.id || ""))
    return null;
  return {
    user: { id: u.id, email: u.email, full_name: u.full_name, active: true, is_admin: true },
    expires_at: data.expires_at,
  };
}
export async function utm7Proxy(request, transport = fetch) {
  const url = new URL(request.url),
    operation = url.pathname.split("/").pop();
  const secure = url.protocol === "https:";
  const cookieName = secure ? "__Host-utm7_session" : "utm7_dev_session";
  const cookieValue =
    (request.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1) || "";
  const token = tokenPattern.test(cookieValue) ? cookieValue : "";
  const cookie = (value, age) =>
    `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  const cleared = () => cookie("", 0);
  if (!["session", "auth", "data"].includes(operation))
    return json({ ok: false, error: "Rota inválida." }, 404);
  if (
    (operation === "session" && request.method !== "GET") ||
    (operation !== "session" && request.method !== "POST")
  )
    return json({ ok: false, error: "Método inválido." }, 405);
  if (request.method === "POST" && request.headers.get("origin") !== url.origin)
    return json({ ok: false, error: "Origem inválida." }, 403);
  let p = {};
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ ok: false, error: "Envie JSON." }, 415);
    if (Number(request.headers.get("content-length") || 0) > 65536)
      return json({ ok: false, error: "Pedido muito grande." }, 413);
    try {
      const reader = request.body?.getReader();
      let total = 0,
        parts = [];
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 65536) {
            await reader.cancel();
            return json({ ok: false, error: "Pedido muito grande." }, 413);
          }
          parts.push(value);
        }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const v of parts) {
        bytes.set(v, offset);
        offset += v.length;
      }
      p = JSON.parse(new TextDecoder().decode(bytes));
      if (!p || typeof p !== "object" || Array.isArray(p)) throw Error();
    } catch {
      return json({ ok: false, error: "Pedido inválido." }, 400);
    }
  }
  const auth = operation !== "data";
  let payload;
  if (operation === "session") payload = { action: "session", token };
  else if (operation === "auth") {
    if (!["login", "activate", "logout"].includes(p.action))
      return json({ ok: false, error: "Operação inválida." }, 400);
    payload = {
      action: p.action,
      token,
      email: typeof p.email === "string" ? p.email.slice(0, 254) : "",
      password: typeof p.password === "string" ? p.password : "",
      activation_token: typeof p.activation_token === "string" ? p.activation_token : "",
    };
    if (payload.password.length > 128 || payload.activation_token.length > 64)
      return json({ ok: false, error: "Pedido inválido." }, 400);
  } else {
    if (!actions.has(p.action)) return json({ ok: false, error: "Operação inválida." }, 400);
    payload = Object.fromEntries(
      Object.entries(p).filter(
        ([k]) => !["token", "user_id", "internal", "authorized", "is_admin", "active"].includes(k),
      ),
    );
    payload.token = token;
  }
  if (!token && (operation === "session" || operation === "data"))
    return json({ ok: false, error: "Entre no UTM7 para continuar." }, 401, cleared());
  try {
    const upstream = await transport(BASE + (auth ? "auth" : "api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(p.action === "sync_meta" ? 120000 : 45000),
    });
    const result = await upstream.json();
    if (typeof result?.ok !== "boolean") throw Error();
    if (!result.ok || !upstream.ok) {
      const status = [400, 401, 403, 409, 429].includes(result.status || upstream.status)
        ? result.status || upstream.status
        : 503;
      return json(
        { ok: false, error: result.error || "Serviço indisponível." },
        status,
        status === 401 ? cleared() : undefined,
      );
    }
    if (auth) {
      if (p.action === "logout") return json({ ok: true, data: {} }, 200, cleared());
      const data = publicSession(result.data);
      if (!data) throw Error();
      if (operation === "session") return json({ ok: true, data });
      if (!tokenPattern.test(result.data.token || "")) throw Error();
      const age = Math.min(28800, Math.floor((Date.parse(data.expires_at) - Date.now()) / 1000));
      if (!(age > 0)) throw Error();
      return json({ ok: true, data }, 200, cookie(result.data.token, age));
    }
    // Strip privileged runtime envelopes even if an upstream regression returns them.
    const data = result.data;
    if (data && typeof data === "object") {
      delete data.internal;
      delete data.token;
      delete data.password_hash;
    }
    return json({ ok: true, data });
  } catch {
    return json(
      { ok: false, error: "O UTM7 está indisponível. Tente novamente em instantes." },
      503,
    );
  }
}

