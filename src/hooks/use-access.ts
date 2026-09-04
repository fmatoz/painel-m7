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

const OWNER_EMAIL = "gestaom7ia@gmail.com";

export function useAppAccess() {
  const { user, loading: authLoading } = useAuth();
  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL;
  const query = useQuery({
    queryKey: ["app-access", user?.id],
    enabled: !!user && !isOwner,
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

  const ownerProfile: AppUser | null =
    user && isOwner
      ? {
          user_id: user.id,
          email: OWNER_EMAIL,
          full_name: String(user.user_metadata?.full_name ?? "Felipe"),
          is_admin: true,
          can_inicio: true,
          can_workflows: true,
          can_crm: true,
          can_financeiro: true,
          active: true,
          created_at: user.created_at,
          updated_at: new Date().toISOString(),
        }
      : null;
  const profile = ownerProfile ?? query.data ?? null;
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
    loading: authLoading || (!!user && !isOwner && query.isLoading),
    error: query.error,
  };
}
