import { SidebarLayout } from '@askrjs/askr-ui/sidebar-layout';
import AppHeader from '../../components/app-header';
import AppSidebar from '../../components/app-sidebar';

export default function AppLayout(props: { children?: unknown }) {
  return (
    <SidebarLayout
      sidebar={<AppSidebar />}
      sidebarWidth="17rem"
      collapseBelow="lg"
      class="app-shell"
    >
      <AppHeader />
      <div class="app-main">{props.children}</div>
    </SidebarLayout>
  );
}
