import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AccessArea = "inicio" | "workflows" | "crm" | "financeiro" | "usuarios";
export type AppUser = Tables<"app_users">;

const permissionField: Record<Exclude<AccessArea, "usuarios">, keyof AppUser> = {
  inicio: "can_inicio",
  workflows: "can_workflows",
  crm: "can_crm",
  financeiro: "can_financeiro",
};

export function useAppAccess() {
  const { user, loading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: ["app-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profile = query.data ?? null;
  const can = (area: AccessArea) => {
    if (!profile?.active) return false;
    if (area === "usuarios") return profile.is_admin;
    return Boolean(profile[permissionField[area]]);
  };

  const firstAllowedPath = can("inicio")
    ? "/inicio"
    : can("workflows")
      ? "/dashboard"
      : can("crm")
        ? "/crm"
        : can("financeiro")
          ? "/financeiro"
          : "/login";

  return {
    profile,
    can,
    firstAllowedPath,
    loading: authLoading || (!!user && query.isLoading),
    error: query.error,
  };
}
