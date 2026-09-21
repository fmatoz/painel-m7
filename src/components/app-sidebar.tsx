import {
  BadgeDollarSign,
  BookOpenText,
  Columns3,
  Home,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type { AccessArea } from "@/hooks/use-access";
import { useAppAccess } from "@/hooks/use-access";
import { useAppTheme } from "@/hooks/use-app-theme";

type Props = {
  active: AccessArea | "materiais" | "vendas";
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
};

const items = [
  { id: "inicio" as const, area: "inicio" as const, href: "/inicio", label: "Início", icon: Home },
  {
    id: "workflows" as const,
    area: "workflows" as const,
    href: "/dashboard",
    label: "Workflows",
    icon: LayoutDashboard,
  },
  { id: "crm" as const, area: "crm" as const, href: "/crm", label: "CRM", icon: Columns3 },
  {
    id: "materiais" as const,
    area: "crm" as const,
    href: "/materiais",
    label: "Materiais",
    icon: BookOpenText,
  },
  {
    id: "vendas" as const,
    area: "crm" as const,
    href: "/vendas",
    label: "Vendas",
    icon: BadgeDollarSign,
  },
  {
    id: "financeiro" as const,
    area: "financeiro" as const,
    href: "/financeiro",
    label: "Financeiro",
    icon: TrendingUp,
  },
  {
    id: "usuarios" as const,
    area: "usuarios" as const,
    href: "/usuarios",
    label: "Usuários",
    icon: Users,
  },
];

export function AppSidebar({
  active,
  mobileOpen,
  setMobileOpen,
  collapsed,
  toggleCollapsed,
}: Props) {
  const { can } = useAppAccess();
  const { theme, toggleTheme } = useAppTheme();
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
                  key={item.id}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-lg py-3 transition-colors ${
                    collapsed ? "justify-center px-2" : "gap-3 px-4"
                  } ${active === item.id ? "bg-blue-600 font-medium text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </a>
              );
            })}
        </nav>
        <div
          className={`absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col gap-1 ${
            collapsed ? "items-center" : "w-[calc(100%-2rem)]"
          }`}
        >
          <button
            type="button"
            onClick={toggleTheme}
            className={`flex items-center rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white ${
              collapsed ? "justify-center" : "gap-2"
            }`}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {!collapsed && <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>}
          </button>
          <button
            onClick={toggleCollapsed}
            className={`hidden items-center rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white lg:flex ${
              collapsed ? "justify-center" : "gap-2"
            }`}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
