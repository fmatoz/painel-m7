import { requestState, tokenFromLink } from "./control-client.js";

const byId = (id) => document.getElementById(id);
let storage;
try { storage = window.sessionStorage; } catch {}
const token = tokenFromLink(window.location, storage);
let state = null;
let busy = false;
let confirmedAt = 0;

function render() {
  byId("toggle").disabled = busy || !state || !token;
  byId("refresh").disabled = busy || !token;
  byId("toggle").setAttribute("aria-busy", String(busy));
  if (!state) {
    byId("badge").textContent = busy ? "Conectando" : "Não confirmado";
    delete byId("badge").dataset.active;
    delete byId("avatar-dot").dataset.active;
    byId("status-title").textContent = busy ? "Consultando o atendimento…" : "Estado não confirmado";
    byId("status-detail").textContent = token ? "Atualize para consultar o estado atual da Luana." : "Use o link privado enviado pela M7 para acessar o controle.";
    byId("toggle-label").textContent = busy ? "Aguarde…" : "Aguardando confirmação";
    byId("updated").textContent = "Estado ainda não confirmado";
    return;
  }
  const active = String(state.enabled);
  byId("badge").dataset.active = active;
  byId("avatar-dot").dataset.active = active;
  byId("badge").textContent = state.enabled ? "Ativada" : "Desativada";
  byId("status-title").textContent = state.enabled ? "Atendimento automático ativado" : "Atendimento automático desativado";
  byId("status-detail").textContent = state.enabled
    ? "A Luana está liberada para atender dentro do horário comercial configurado."
    : "As respostas automáticas estão bloqueadas. Você pode continuar atendendo pelo WhatsApp.";
  byId("toggle").dataset.mode = state.enabled ? "disable" : "enable";
  byId("toggle-label").textContent = busy ? "Confirmando…" : state.enabled ? "Desativar Luana" : "Ativar Luana";
  byId("updated").textContent = "Consultado às " + new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(confirmedAt);
}

async function update(change) {
  if (busy || !token) return;
  busy = true;
  byId("feedback").textContent = "";
  byId("feedback").dataset.error = "false";
  render();
  try {
    const result = await requestState(token, change);
    if (change && result.enabled !== change.enabled) throw new Error("A alteração não foi confirmada. Atualize o estado.");
    state = result;
    confirmedAt = Date.now();
    if (change) byId("feedback").textContent = result.enabled ? "Luana ativada com sucesso." : "Luana desativada com sucesso.";
  } catch (error) {
    state = null;
    byId("feedback").dataset.error = "true";
    byId("feedback").textContent = error?.name === "TimeoutError"
      ? "O servidor demorou a responder. Atualize para confirmar o estado antes de tentar novamente."
      : error instanceof Error ? error.message : "Não foi possível confirmar o estado. Atualize e tente novamente.";
  } finally { busy = false; render(); }
}

byId("toggle").addEventListener("click", () => {
  if (state && !busy) update({ enabled: !state.enabled, expectedVersion: state.version });
});
byId("refresh").addEventListener("click", () => update());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { state = null; render(); }
  else update();
});
setInterval(() => { if (!document.hidden) update(); }, 30000);
render();
update();
