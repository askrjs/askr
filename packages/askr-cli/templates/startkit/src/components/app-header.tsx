import { route, Link } from '@askrjs/askr/router';
import { Input } from '@askrjs/askr-ui/input';
import { Inline } from '@askrjs/askr-ui/inline';
import { Spacer } from '@askrjs/askr-ui/spacer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@askrjs/askr-ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@askrjs/askr-ui/avatar';
import { Search } from '@askrjs/icons-lucide';
import { showToast } from '../toast';
import { signOut } from '../lib/mock-data';

const labelsByPath = new Map<string, string>([
  ['/dashboard', 'Dashboard'],
  ['/accounts', 'Accounts'],
  ['/settings', 'Settings'],
]);

export default function AppHeader() {
  const breadcrumb = () => labelsByPath.get(route().path) ?? 'Workspace';

  return (
    <header class="app-header">
      <Inline align="center" gap="var(--ak-space-lg)" wrap="wrap">
        <div class="breadcrumbs">
          <span>App</span>
          <span aria-hidden="true">/</span>
          <strong>{breadcrumb()}</strong>
        </div>

        <label class="header-search" aria-label="Search">
          <Search size={15} aria-hidden="true" />
          <Input placeholder="Search docs, accounts, settings..." disabled />
        </label>

        <Spacer />

        <DropdownMenu>
          <DropdownMenuTrigger class="header-account-trigger">
            <Avatar>
              <AvatarFallback>AM</AvatarFallback>
            </Avatar>
            <span class="header-account-name">Alex Morgan</span>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent side="bottom" align="end" sideOffset={8}>
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/settings">Profile settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    showToast({
                      title: 'Notifications enabled',
                      description: 'Connect this action to your notification center.',
                    })
                  }
                >
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  signOut();
                  showToast({
                    title: 'Signed out',
                    description: 'Session state is now cleared from local storage.',
                  });
                  window.location.assign('/login');
                }}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </Inline>
    </header>
  );
}
