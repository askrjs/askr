import type { JSXElement } from '@askrjs/askr/foundations';
import * as askrUi from '@askrjs/askr-ui';
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Breadcrumb,
  BreadcrumbCurrent,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarPortal,
  MenubarTrigger,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  Pagination,
  PaginationEllipsis,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
  Progress,
  ProgressCircle,
  ProgressCircleIndicator,
  ProgressIndicator,
  Skeleton,
  Slider,
  SliderRange,
  SliderThumb,
  SliderTrack,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToggleGroup,
  ToggleGroupItem,
  type AccordionContentAsChildProps,
  type AccordionContentProps,
  type AccordionMultipleProps,
  type AccordionSingleProps,
  type AccordionTriggerAsChildProps,
  type AccordionTriggerProps,
  type AvatarFallbackAsChildProps,
  type AvatarFallbackProps,
  type AvatarImageProps,
  type AvatarProps,
  type BadgeAsChildProps,
  type BadgeProps,
  type BreadcrumbCurrentAsChildProps,
  type BreadcrumbCurrentProps,
  type BreadcrumbLinkAsChildProps,
  type BreadcrumbLinkProps,
  type MenubarContentAsChildProps,
  type MenubarContentProps,
  type MenubarItemAsChildProps,
  type MenubarItemProps,
  type MenubarMenuProps,
  type MenubarProps,
  type MenubarTriggerAsChildProps,
  type MenubarTriggerProps,
  type NavigationMenuContentAsChildProps,
  type NavigationMenuContentProps,
  type NavigationMenuIndicatorAsChildProps,
  type NavigationMenuIndicatorProps,
  type NavigationMenuItemProps,
  type NavigationMenuLinkAsChildProps,
  type NavigationMenuLinkProps,
  type NavigationMenuListAsChildProps,
  type NavigationMenuListProps,
  type NavigationMenuProps,
  type NavigationMenuTriggerAsChildProps,
  type NavigationMenuTriggerProps,
  type NavigationMenuViewportAsChildProps,
  type NavigationMenuViewportProps,
  type PaginationPageAsChildProps,
  type PaginationPageProps,
  type PaginationProps,
  type ProgressCircleProps,
  type ProgressProps,
  type SkeletonAsChildProps,
  type SkeletonProps,
  type SliderProps,
  type SpinnerProps,
  type TabsContentAsChildProps,
  type TabsContentProps,
  type TabsProps,
  type TabsTriggerAsChildProps,
  type TabsTriggerProps,
  type ToastActionAsChildProps,
  type ToastActionProps,
  type ToastCloseAsChildProps,
  type ToastCloseProps,
  type ToastOwnProps,
  type ToastProps,
  type ToggleGroupItemAsChildProps,
  type ToggleGroupItemProps,
  type ToggleGroupMultipleProps,
  type ToggleGroupSingleProps,
  Container,
  Stack,
  Inline,
  Grid,
  Center,
  Spacer,
  SidebarLayout,
  TopbarLayout,
  type ContainerProps,
  type StackProps,
  type InlineProps,
  type GridProps,
  type CenterProps,
  type SpacerProps,
  type SidebarLayoutProps,
  type TopbarLayoutProps,
} from '@askrjs/askr-ui';
import { Accordion as AccordionSubpath } from '@askrjs/askr-ui/composites/accordion';
import { Avatar as AvatarSubpath } from '@askrjs/askr-ui/primitives/avatar';
import { Badge as BadgeSubpath } from '@askrjs/askr-ui/primitives/badge';
import { Breadcrumb as BreadcrumbSubpath } from '@askrjs/askr-ui/composites/breadcrumb';
import { Collapsible as CollapsibleSubpath } from '@askrjs/askr-ui/composites/collapsible';
import { Menubar as MenubarSubpath } from '@askrjs/askr-ui/composites/menubar';
import { NavigationMenu as NavigationMenuSubpath } from '@askrjs/askr-ui/composites/navigation-menu';
import { Pagination as PaginationSubpath } from '@askrjs/askr-ui/composites/pagination';
import { Progress as ProgressSubpath } from '@askrjs/askr-ui/primitives/progress';
import { ProgressCircle as ProgressCircleSubpath } from '@askrjs/askr-ui/primitives/progress-circle';
import { Skeleton as SkeletonSubpath } from '@askrjs/askr-ui/primitives/skeleton';
import { Slider as SliderSubpath } from '@askrjs/askr-ui/primitives/slider';
import { Spinner as SpinnerSubpath } from '@askrjs/askr-ui/primitives/spinner';
import { Tabs as TabsSubpath } from '@askrjs/askr-ui/composites/tabs';
import { ToastProvider as ToastSubpath } from '@askrjs/askr-ui/composites/toast';
import { ToggleGroup as ToggleGroupSubpath } from '@askrjs/askr-ui/primitives/toggle-group';
import { Container as ContainerSubpath } from '@askrjs/askr-ui/primitives/container';
import { Stack as StackSubpath } from '@askrjs/askr-ui/primitives/stack';
import { Inline as InlineSubpath } from '@askrjs/askr-ui/primitives/inline';
import { Grid as GridSubpath } from '@askrjs/askr-ui/primitives/grid';
import { Center as CenterSubpath } from '@askrjs/askr-ui/primitives/center';
import { Spacer as SpacerSubpath } from '@askrjs/askr-ui/primitives/spacer';
import { SidebarLayout as SidebarLayoutSubpath } from '@askrjs/askr-ui/patterns/sidebar-layout';
import { TopbarLayout as TopbarLayoutSubpath } from '@askrjs/askr-ui/patterns/topbar-layout';

const slotChild = {} as JSXElement;

const accordionFromSubpath: typeof Accordion = AccordionSubpath;
const avatarFromSubpath: typeof Avatar = AvatarSubpath;
const badgeFromSubpath: typeof Badge = BadgeSubpath;
const breadcrumbFromSubpath: typeof Breadcrumb = BreadcrumbSubpath;
const collapsibleFromSubpath: typeof Collapsible = CollapsibleSubpath;
const menubarFromSubpath: typeof Menubar = MenubarSubpath;
const navigationMenuFromSubpath: typeof NavigationMenu = NavigationMenuSubpath;
const paginationFromSubpath: typeof Pagination = PaginationSubpath;
const progressFromSubpath: typeof Progress = ProgressSubpath;
const progressCircleFromSubpath: typeof ProgressCircle = ProgressCircleSubpath;
const skeletonFromSubpath: typeof Skeleton = SkeletonSubpath;
const sliderFromSubpath: typeof Slider = SliderSubpath;
const spinnerFromSubpath: typeof Spinner = SpinnerSubpath;
const tabsFromSubpath: typeof Tabs = TabsSubpath;
const toastFromSubpath: typeof ToastProvider = ToastSubpath;
const toggleGroupFromSubpath: typeof ToggleGroup = ToggleGroupSubpath;
const menubarFromRoot: typeof Menubar = askrUi.Menubar;
const navigationMenuFromRoot: typeof NavigationMenu = askrUi.NavigationMenu;
const containerFromSubpath: typeof Container = ContainerSubpath;
const stackFromSubpath: typeof Stack = StackSubpath;
const inlineFromSubpath: typeof Inline = InlineSubpath;
const gridFromSubpath: typeof Grid = GridSubpath;
const centerFromSubpath: typeof Center = CenterSubpath;
const spacerFromSubpath: typeof Spacer = SpacerSubpath;
const sidebarLayoutFromSubpath: typeof SidebarLayout = SidebarLayoutSubpath;
const topbarLayoutFromSubpath: typeof TopbarLayout = TopbarLayoutSubpath;

const containerLayoutProps: ContainerProps = { maxWidth: '64rem' };
const stackLayoutProps: StackProps = { gap: '1rem', align: 'center' };
const inlineLayoutProps: InlineProps = { gap: '0.5rem', wrap: 'wrap' };
const gridLayoutProps: GridProps = { columns: 3, gap: '1rem' };
const centerLayoutProps: CenterProps = {
  axis: 'horizontal',
  minHeight: '100vh',
};
const spacerLayoutProps: SpacerProps = { grow: 1 };
const sidebarLayoutLayoutProps: SidebarLayoutProps = {
  sidebarWidth: '20rem',
  gap: '1rem',
};
const topbarLayoutLayoutProps: TopbarLayoutProps = { topbarHeight: '3rem' };

const badgeProps: BadgeProps = { children: 'Beta' };
const badgeAsChildProps: BadgeAsChildProps = {
  asChild: true,
  children: slotChild,
};
const skeletonProps: SkeletonProps = { children: 'loading' };
const skeletonAsChildProps: SkeletonAsChildProps = {
  asChild: true,
  children: slotChild,
};
const avatarProps: AvatarProps = { children: 'avatar' };
const avatarImageProps: AvatarImageProps = { src: '/avatar.png', alt: 'User' };
const avatarFallbackProps: AvatarFallbackProps = { children: 'JD' };
const avatarFallbackAsChildProps: AvatarFallbackAsChildProps = {
  asChild: true,
  children: slotChild,
};
const progressProps: ProgressProps = { value: 50, max: 100 };
const progressCircleProps: ProgressCircleProps = { value: 75, max: 100 };
const spinnerProps: SpinnerProps = { label: 'Working' };
const breadcrumbLinkProps: BreadcrumbLinkProps = {
  href: '/docs',
  children: 'Docs',
};
const breadcrumbLinkAsChildProps: BreadcrumbLinkAsChildProps = {
  asChild: true,
  children: slotChild,
};
const breadcrumbCurrentProps: BreadcrumbCurrentProps = { children: 'Current' };
const breadcrumbCurrentAsChildProps: BreadcrumbCurrentAsChildProps = {
  asChild: true,
  children: slotChild,
};
const menubarProps: MenubarProps = { children: 'menu' };
const menubarMenuProps: MenubarMenuProps = { children: 'menu' };
const menubarTriggerProps: MenubarTriggerProps = { children: 'File' };
const menubarTriggerAsChildProps: MenubarTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
};
const menubarContentProps: MenubarContentProps = { children: 'Panel' };
const menubarContentAsChildProps: MenubarContentAsChildProps = {
  asChild: true,
  children: slotChild,
};
const menubarItemProps: MenubarItemProps = { children: 'Item' };
const menubarItemAsChildProps: MenubarItemAsChildProps = {
  asChild: true,
  children: slotChild,
};
const navigationMenuProps: NavigationMenuProps = { children: 'nav' };
const navigationMenuListProps: NavigationMenuListProps = { children: 'list' };
const navigationMenuListAsChildProps: NavigationMenuListAsChildProps = {
  asChild: true,
  children: slotChild,
};
const navigationMenuItemProps: NavigationMenuItemProps = {
  value: 'products',
  children: 'item',
};
const navigationMenuTriggerProps: NavigationMenuTriggerProps = {
  children: 'Products',
};
const navigationMenuTriggerAsChildProps: NavigationMenuTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
};
const navigationMenuContentProps: NavigationMenuContentProps = {
  children: 'Panel',
};
const navigationMenuContentAsChildProps: NavigationMenuContentAsChildProps = {
  asChild: true,
  children: slotChild,
};
const navigationMenuLinkProps: NavigationMenuLinkProps = {
  href: '/products',
  children: 'Products',
};
const navigationMenuLinkAsChildProps: NavigationMenuLinkAsChildProps = {
  asChild: true,
  children: slotChild,
};
const navigationMenuViewportProps: NavigationMenuViewportProps = {};
const navigationMenuViewportAsChildProps: NavigationMenuViewportAsChildProps = {
  asChild: true,
  children: slotChild,
};
const navigationMenuIndicatorProps: NavigationMenuIndicatorProps = {};
const navigationMenuIndicatorAsChildProps: NavigationMenuIndicatorAsChildProps =
  {
    asChild: true,
    children: slotChild,
  };
const paginationProps: PaginationProps = { count: 10, defaultPage: 2 };
const paginationPageProps: PaginationPageProps = { page: 2, children: '2' };
const paginationPageAsChildProps: PaginationPageAsChildProps = {
  asChild: true,
  children: slotChild,
  page: 2,
};
const accordionSingleProps: AccordionSingleProps = { defaultValue: 'a' };
const accordionMultipleProps: AccordionMultipleProps = {
  type: 'multiple',
  defaultValue: ['a'],
};
const accordionTriggerProps: AccordionTriggerProps = { children: 'Open' };
const accordionTriggerAsChildProps: AccordionTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
};
const accordionContentProps: AccordionContentProps = { children: 'Panel' };
const accordionContentAsChildProps: AccordionContentAsChildProps = {
  asChild: true,
  children: slotChild,
};
const tabsProps: TabsProps = { defaultValue: 'overview' };
const tabsTriggerProps: TabsTriggerProps = {
  value: 'overview',
  children: 'Overview',
};
const tabsTriggerAsChildProps: TabsTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
  value: 'overview',
};
const tabsContentProps: TabsContentProps = {
  value: 'overview',
  children: 'Panel',
};
const tabsContentAsChildProps: TabsContentAsChildProps = {
  asChild: true,
  children: slotChild,
  value: 'overview',
};
const toggleGroupSingleProps: ToggleGroupSingleProps = { defaultValue: 'left' };
const toggleGroupMultipleProps: ToggleGroupMultipleProps = {
  type: 'multiple',
  defaultValue: ['left'],
};
const toggleGroupItemProps: ToggleGroupItemProps = {
  value: 'left',
  children: 'Left',
};
const toggleGroupItemAsChildProps: ToggleGroupItemAsChildProps = {
  asChild: true,
  children: slotChild,
  value: 'left',
};
const toastProps: ToastProps = { defaultOpen: true };
const toastOwnProps: ToastOwnProps = { defaultOpen: false };
const toastActionProps: ToastActionProps = { children: 'Undo' };
const toastActionAsChildProps: ToastActionAsChildProps = {
  asChild: true,
  children: slotChild,
};
const toastCloseProps: ToastCloseProps = { children: 'Dismiss' };
const toastCloseAsChildProps: ToastCloseAsChildProps = {
  asChild: true,
  children: slotChild,
};
const sliderProps: SliderProps = { defaultValue: 25, name: 'volume' };

const _invalidAccordionTrigger: AccordionTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
  // @ts-expect-error asChild accordion trigger props must not accept native button type.
  type: 'button',
};

const _invalidTabsTrigger: TabsTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
  value: 'overview',
  // @ts-expect-error asChild tabs trigger props must not accept native button type.
  type: 'button',
};

const _invalidToggleGroupItem: ToggleGroupItemAsChildProps = {
  asChild: true,
  children: slotChild,
  value: 'left',
  // @ts-expect-error asChild toggle group item props must not accept native button type.
  type: 'button',
};

const _invalidMenubarTrigger: MenubarTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
  // @ts-expect-error asChild menubar trigger props must not accept native button type.
  type: 'button',
};

const _invalidNavigationTrigger: NavigationMenuTriggerAsChildProps = {
  asChild: true,
  children: slotChild,
  // @ts-expect-error asChild navigation menu trigger props must not accept native button type.
  type: 'button',
};

void [
  accordionFromSubpath,
  avatarFromSubpath,
  badgeFromSubpath,
  breadcrumbFromSubpath,
  collapsibleFromSubpath,
  menubarFromSubpath,
  navigationMenuFromSubpath,
  paginationFromSubpath,
  progressFromSubpath,
  progressCircleFromSubpath,
  skeletonFromSubpath,
  sliderFromSubpath,
  spinnerFromSubpath,
  tabsFromSubpath,
  toastFromSubpath,
  toggleGroupFromSubpath,
  menubarFromRoot,
  navigationMenuFromRoot,
  Badge,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbCurrent,
  BreadcrumbSeparator,
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarPortal,
  MenubarContent,
  MenubarItem,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuViewport,
  NavigationMenuIndicator,
  CollapsibleTrigger,
  CollapsibleContent,
  ProgressIndicator,
  ProgressCircleIndicator,
  PaginationPrevious,
  PaginationNext,
  PaginationPage,
  PaginationEllipsis,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionContent,
  TabsList,
  TabsTrigger,
  TabsContent,
  ToggleGroupItem,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  SliderTrack,
  SliderRange,
  SliderThumb,
  badgeProps,
  badgeAsChildProps,
  skeletonProps,
  skeletonAsChildProps,
  avatarProps,
  avatarImageProps,
  avatarFallbackProps,
  avatarFallbackAsChildProps,
  progressProps,
  progressCircleProps,
  spinnerProps,
  breadcrumbLinkProps,
  breadcrumbLinkAsChildProps,
  breadcrumbCurrentProps,
  breadcrumbCurrentAsChildProps,
  menubarProps,
  menubarMenuProps,
  menubarTriggerProps,
  menubarTriggerAsChildProps,
  menubarContentProps,
  menubarContentAsChildProps,
  menubarItemProps,
  menubarItemAsChildProps,
  navigationMenuProps,
  navigationMenuListProps,
  navigationMenuListAsChildProps,
  navigationMenuItemProps,
  navigationMenuTriggerProps,
  navigationMenuTriggerAsChildProps,
  navigationMenuContentProps,
  navigationMenuContentAsChildProps,
  navigationMenuLinkProps,
  navigationMenuLinkAsChildProps,
  navigationMenuViewportProps,
  navigationMenuViewportAsChildProps,
  navigationMenuIndicatorProps,
  navigationMenuIndicatorAsChildProps,
  paginationProps,
  paginationPageProps,
  paginationPageAsChildProps,
  accordionSingleProps,
  accordionMultipleProps,
  accordionTriggerProps,
  accordionTriggerAsChildProps,
  accordionContentProps,
  accordionContentAsChildProps,
  tabsProps,
  tabsTriggerProps,
  tabsTriggerAsChildProps,
  tabsContentProps,
  tabsContentAsChildProps,
  toggleGroupSingleProps,
  toggleGroupMultipleProps,
  toggleGroupItemProps,
  toggleGroupItemAsChildProps,
  toastProps,
  toastOwnProps,
  toastActionProps,
  toastActionAsChildProps,
  toastCloseProps,
  toastCloseAsChildProps,
  sliderProps,
  containerFromSubpath,
  stackFromSubpath,
  inlineFromSubpath,
  gridFromSubpath,
  centerFromSubpath,
  spacerFromSubpath,
  sidebarLayoutFromSubpath,
  topbarLayoutFromSubpath,
  Container,
  Stack,
  Inline,
  Grid,
  Center,
  Spacer,
  SidebarLayout,
  TopbarLayout,
  containerLayoutProps,
  stackLayoutProps,
  inlineLayoutProps,
  gridLayoutProps,
  centerLayoutProps,
  spacerLayoutProps,
  sidebarLayoutLayoutProps,
  topbarLayoutLayoutProps,
];
