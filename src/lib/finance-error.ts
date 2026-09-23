function detail(value: unknown, depth = 0): string | undefined {
  if (depth > 3) return;
  if (typeof value === "string") {
    try {
      return detail(JSON.parse(value), depth + 1);
    } catch {
      const text = value.trim();
      if (text && !text.startsWith("<")) return text.slice(0, 350);
    }
  }
  if (value && typeof value === "object") {
    const body = value as Record<string, unknown>;
    return detail(body.message, depth + 1) || detail(body.error, depth + 1);
  }
}

export async function financialFunctionError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    let reason: string | undefined;
    try {
      reason = detail(await context.clone().json());
    } catch {
      // Do not expose an upstream HTML error page to the user.
    }
    return new Error(`HTTP ${context.status}: ${reason || "O servidor não informou o motivo da falha."}`);
  }
  return error instanceof Error ? error : new Error("Não foi possível conectar ao servidor.");
}
