import { Link, route } from '@askrjs/askr/router';
import { LayoutDashboard, Users, Settings, Layers, ShieldCheck } from '@askrjs/askr-lucide';
import { joinClasses } from '../utils/join-classes';

type NavItem = {
  href: string;
  label: string;
  icon: (props: { size?: number; 'aria-hidden'?: boolean }) => unknown;
};

const primaryNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const secondaryNav: NavItem[] = [
  { href: '/', label: 'Marketing site', icon: Layers },
  { href: '/login', label: 'Auth entry', icon: ShieldCheck },
];

export default function AppSidebar() {
  const isActive = (href: string) => {
    const current = route().path;
    return current === href || current.startsWith(`${href}/`);
  };

  return (
    <aside class="app-sidebar" aria-label="Sidebar navigation">
      <div class="sidebar-brand">
        <span class="brand-pill" aria-hidden="true">
          A
        </span>
        <div>
          <p class="sidebar-title">{'{{appName}}'}</p>
          <p class="sidebar-subtitle">Starter Kit</p>
        </div>
      </div>

      <p class="sidebar-section-label">Workspace</p>
      <nav class="sidebar-nav">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              href={item.href}
              class={joinClasses('sidebar-link', isActive(item.href) ? 'is-active' : undefined)}
            >
              <Icon size={16} aria-hidden={true} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <p class="sidebar-section-label">Other</p>
      <nav class="sidebar-nav sidebar-nav-secondary">
        {secondaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link href={item.href} class="sidebar-link">
              <Icon size={16} aria-hidden={true} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
