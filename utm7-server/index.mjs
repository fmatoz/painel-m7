import { createServer } from "node:http";
import { pool } from "./db.mjs";
import { createService } from "./service.mjs";
const service = createService(pool);
const concurrency = { active: 0 };
createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json;charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (data, status = 200) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };
  if (req.url === "/health" && req.method === "GET") {
    try {
      await pool.query("SELECT 1");
      return send({ ok: true });
    } catch {
      return send({ ok: false }, 503);
    }
  }
  if (req.method !== "POST" || !["/auth", "/operation"].includes(req.url))
    return send({ ok: false, error: "Not found" }, 404);
  if (concurrency.active >= 12)
    return send({ ok: false, error: "Serviço ocupado. Tente novamente." }, 503);
  concurrency.active++;
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 4000000) {
        send({ ok: false, error: "Pedido muito grande." }, 413);
        return;
      }
    }
    let p;
    try {
      p = JSON.parse(body);
    } catch {
      return send({ ok: false, error: "Pedido inválido." }, 400);
    }
    if (!p || typeof p !== "object" || Array.isArray(p))
      return send({ ok: false, error: "Pedido inválido." }, 400);
    const result = await (req.url === "/auth" ? service.auth(p) : service.operation(p));
    send(result, req.url === "/auth" ? result.status || 200 : 200);
  } catch {
    send({ ok: false, error: "O serviço do UTM7 está temporariamente indisponível." }, 503);
  } finally {
    concurrency.active--;
  }
}).listen(8080, "0.0.0.0", () => console.log("UTM7 private gateway ready"));

