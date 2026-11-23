import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Person = { name: string; active: boolean };
const IDLE_MS = 5 * 60_000;

export function CrmPresence({ userId, name }: { userId: string; name: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [connected, setConnected] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stopped = false;
    let subscribed = false;
    let lastActivity = Date.now();
    let published: boolean | null = null;
    const channel = supabase.channel("m7-crm-presence-v1", { config: { private: true, presence: { key: userId } } });
    const publish = () => {
      if (!subscribed || stopped) return;
      const active = document.visibilityState === "visible" && Date.now() - lastActivity < IDLE_MS;
      if (active === published) return;
      published = active;
      void channel.track({ name, active }).then((result) => {
        if (result !== "ok") published = null;
      });
    };
    const activity = () => { lastActivity = Date.now(); publish(); };
    const visibility = () => { publish(); };
    channel.on("presence", { event: "sync" }, () => {
      if (stopped) return;
      const state = channel.presenceState<{ name: string; active: boolean }>();
      setPeople(Object.values(state).map((tabs) => ({
        name: String(tabs[0]?.name || "Usuário").slice(0, 80),
        active: tabs.some((tab) => tab.active === true),
      })).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)));
    }).subscribe((status) => {
      if (stopped) return;
      subscribed = status === "SUBSCRIBED";
      setConnected(subscribed);
      setFailed(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED");
      published = null;
      if (subscribed) publish();
      else setPeople([]);
    });
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, activity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(publish, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, activity, true));
      document.removeEventListener("visibilitychange", visibility);
      void supabase.removeChannel(channel);
    };
  }, [userId, name]);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" aria-label="Pessoas no CRM">
      {!connected ? <span className="text-zinc-400">{failed ? "Presença temporariamente indisponível" : "Conectando presença…"}</span> : people.map((person, index) => (
        <span key={index} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/30 px-2 py-1"
          title={person.active ? "Usando o CRM nos últimos 5 minutos" : "CRM aberto, sem atividade recente ou em outra aba"}>
          <span className={`h-2 w-2 rounded-full ${person.active ? "bg-emerald-500" : "bg-amber-500"}`} />
          {person.name} · {person.active ? "Ativo" : "Ausente"}
        </span>
      ))}
    </div>
  );
}
