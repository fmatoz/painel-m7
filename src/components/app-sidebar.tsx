import {
  Columns3,
  Home,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type { AccessArea } from "@/hooks/use-access";
import { useAppAccess } from "@/hooks/use-access";

type Props = {
  active: AccessArea;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
};

const items = [
  { area: "inicio" as const, href: "/inicio", label: "Início", icon: Home },
  { area: "workflows" as const, href: "/dashboard", label: "Workflows", icon: LayoutDashboard },
  { area: "crm" as const, href: "/crm", label: "CRM", icon: Columns3 },
  { area: "financeiro" as const, href: "/financeiro", label: "Financeiro", icon: TrendingUp },
  { area: "usuarios" as const, href: "/usuarios", label: "Usuários", icon: Users },
];

export function AppSidebar({
  active,
  mobileOpen,
  setMobileOpen,
  collapsed,
  toggleCollapsed,
}: Props) {
  const { can } = useAppAccess();
  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 border-r border-zinc-800 bg-zinc-900 transition-[width,transform] duration-200 ${
          collapsed ? "w-20" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div
          className={`flex h-16 items-center border-b border-zinc-800 ${collapsed ? "justify-center px-2" : "justify-between px-6"}`}
        >
          <img
            src="/logo-v2.png"
            alt="Gestão M7"
            className={`${collapsed ? "h-8 w-10" : "h-10"} object-contain`}
          />
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-6 w-6 text-zinc-400" />
          </button>
        </div>
        <nav className={`space-y-2 ${collapsed ? "p-3" : "p-4"}`}>
          {items
            .filter((item) => can(item.area))
            .map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.area}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-lg py-3 transition-colors ${
                    collapsed ? "justify-center px-2" : "gap-3 px-4"
                  } ${active === item.area ? "bg-blue-600 font-medium text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </a>
              );
            })}
        </nav>
        <button
          onClick={toggleCollapsed}
          className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white lg:flex"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
          {!collapsed && <span>Recolher</span>}
        </button>
      </aside>
    </>
  );
}
