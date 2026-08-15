import { createFileRoute, Link, Outlet, useLocation, redirect } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  Cable,
  Palette,
  Settings as SettingsIcon,
  ShieldCheck,
  User,
  Users,
  Webhook,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings" || location.pathname === "/settings/") {
      throw redirect({ to: "/settings/general" });
    }
  },
});

const submenu = [
  { to: "/settings/general", label: "General", icon: SettingsIcon },
  { to: "/settings/business-profile", label: "Business Profile", icon: Building2 },
  { to: "/settings/profile", label: "Profile", icon: User },
  { to: "/settings/integrations", label: "Integrations", icon: Cable },
  { to: "/settings/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
  { to: "/settings/appearance", label: "Appearance", icon: Palette },
  { to: "/settings/team", label: "Team", icon: Users },
  { to: "/settings/security", label: "Security", icon: ShieldCheck },
] as const;

function SettingsLayout() {
  const location = useLocation();
  return (
    <div className="w-full px-6 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-primary" />
        <h1 className="text-3xl">Settings</h1>
      </div>

      {/* Horizontal tab bar */}
      <div className="mb-6 border-b border-border">
        <nav
          role="tablist"
          aria-label="Settings sections"
          className="-mb-px flex flex-wrap gap-1 overflow-x-auto"
        >
          {submenu.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                role="tab"
                aria-selected={active}
                className={`group inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="w-full min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
