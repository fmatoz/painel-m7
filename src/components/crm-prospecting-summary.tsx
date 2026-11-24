import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, UserCheck } from "lucide-react";
import { crmApi } from "@/lib/crm-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProspectingSummary = {
  date: string;
  scope: "team" | "self";
  total: number;
  own_total: number;
  unattributed: number;
  by_sdr: Array<{ id: string | null; name: string; total: number }>;
};

export function CrmProspectingSummary({
  accessToken,
  userId,
  now,
}: {
  accessToken: string;
  userId: string;
  now: Date;
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const reportDate = selectedDate || today;
  const query = useQuery({
    queryKey: ["crm-prospecting-summary", userId, reportDate],
    queryFn: () =>
      crmApi<ProspectingSummary>(accessToken, {
        action: "prospecting-summary",
        reportDate,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6"
      aria-labelledby="prospecting-title"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="prospecting-title" className="flex items-center gap-2 text-lg font-semibold">
            <UserCheck className="h-5 w-5 text-blue-400" />
            Prospecção do dia
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Primeira entrada em Primeiro contato. Cada lead conta uma única vez.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-zinc-400">
            Data · horário de Brasília
            <Input
              type="date"
              value={reportDate}
              max={today}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-1 w-auto bg-zinc-950 text-white"
            />
          </label>
          {selectedDate && (
            <Button variant="outline" onClick={() => setSelectedDate("")}>
              Hoje
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            aria-label="Atualizar prospecção"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <div
          role="status"
          className="flex min-h-24 items-center justify-center gap-2 text-sm text-zinc-400"
        >
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando prospecção…
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-zinc-400">
          Não foi possível carregar a prospecção. Use o botão atualizar para tentar novamente.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-sm text-zinc-400">
              {query.data.scope === "team"
                ? "Total prospectado pela equipe"
                : "Leads prospectados por você"}
            </p>
            <p className="mt-1 text-3xl font-bold text-zinc-100">{query.data.total}</p>
          </div>
          {query.data.scope === "team" && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-zinc-300">
                Por pessoa · quem fez o primeiro contato
              </h3>
              {query.data.by_sdr.length ? (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {query.data.by_sdr.map((person) => (
                    <li
                      key={person.id ?? "unattributed"}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-zinc-800 px-4 py-3"
                    >
                      <span className="min-w-0 break-words text-sm text-zinc-300">
                        {person.name}
                        {person.id === userId ? " (você)" : ""}
                      </span>
                      <strong className="text-lg text-zinc-100">{person.total}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-400">
                  Nenhum primeiro contato registrado nesta data.
                </p>
              )}
              {query.data.unattributed > 0 && (
                <p className="mt-3 text-xs text-zinc-400">
                  O histórico antigo não registrava a autoria. Esses leads entram no total, sem
                  atribuir a um SDR.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
