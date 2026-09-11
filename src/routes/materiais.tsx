import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BookOpenText, Loader2, LogOut, Menu } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { CrmMaterialLibrary } from "@/components/crm-material-library";
import { useAppSidebar } from "@/hooks/use-app-sidebar";
import { useAppAccess } from "@/hooks/use-access";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/materiais")({ component: MateriaisComponent });

function MateriaisComponent() {
  const sidebar = useAppSidebar();
  const navigate = useNavigate();
  const { user, session, loading, signOut } = useAuth();
  const access = useAppAccess();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", search: {} as never });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!access.loading && session && !access.can("crm")) {
      window.location.href = access.firstAllowedPath;
    }
  }, [access, session]);

  if (loading || access.loading || !session || !user || !access.can("crm")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">
      <AppSidebar active="materiais" {...sidebar} />
      <main
        className={`flex h-full min-w-0 flex-1 flex-col transition-[padding] duration-200 ${sidebar.collapsed ? "lg:pl-20" : "lg:pl-64"}`}
      >
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur md:px-6">
          <button onClick={() => sidebar.setMobileOpen(true)} className="lg:hidden">
            <Menu className="h-6 w-6 text-zinc-400" />
          </button>
          <BookOpenText className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="font-bold">Materiais M7</h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              Textos e respostas para prospecção
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 md:block">{user.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 lg:p-7">
          <CrmMaterialLibrary
            accessToken={session.access_token}
            currentUserId={user.id}
            isAdmin={Boolean(access.profile?.is_admin)}
          />
        </div>
      </main>
    </div>
  );
}
