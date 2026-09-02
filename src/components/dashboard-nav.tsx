"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Printer,
  ShoppingCart,
  BarChart3,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";

const LINKS = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/departamentos", label: "Departamentos", icon: Building2 },
  { href: "/impresoras", label: "Impresoras", icon: Printer },
  { href: "/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/consumo", label: "Consumo", icon: BarChart3 },
] as const;

const ADMIN_LINKS = [
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

export function DashboardNav({ isAdmin, username }: { isAdmin: boolean; username: string }) {
  const pathname = usePathname();

  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-brand-950">
      <div className="px-5 py-6">
        <Image src="/logo-light.png" alt="PgO" width={140} height={140} className="h-auto w-28" priority />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {links.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent-400 text-brand-950"
                  : "text-brand-200 hover:bg-brand-800 hover:text-white"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 mt-4 border-t border-brand-800 pt-3">
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-400 text-sm font-semibold text-brand-950">
            {username.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-sm text-brand-100">{username}</span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-300 hover:bg-brand-800 hover:text-white"
          >
            <LogOut size={18} strokeWidth={2} />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
