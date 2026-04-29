# UI: Components

Reference for all `@askrjs/ui` components.

> Category-level entry points mirror the package taxonomy. Per-component subpaths remain
> available when you want the narrowest possible import.

## Foundation components

```ts
import {
  Button,
  Checkbox,
  Field,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Textarea,
  Toggle,
  ToggleGroup,
  VisuallyHidden,
} from '@askrjs/ui/foundation';
```

## Focus components

```ts
import { DismissableLayer, FocusRing, FocusScope } from '@askrjs/ui/focus';
```

## Overlay components

```ts
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogClose,
} from '@askrjs/ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogAction,
  AlertDialogCancel,
} from '@askrjs/ui/alert-dialog';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverPortal,
} from '@askrjs/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@askrjs/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@askrjs/ui/dropdown-menu';
import { Menu, MenuContent, MenuItem } from '@askrjs/ui/overlay';
```

## Disclosure components

```ts
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@askrjs/ui/accordion';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@askrjs/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@askrjs/ui/tabs';
```

## Status components

```ts
import { Badge } from '@askrjs/ui/badge';
import { Spinner } from '@askrjs/ui/spinner';
import { Skeleton } from '@askrjs/ui/skeleton';
import { Progress } from '@askrjs/ui/progress';
import { ProgressCircle } from '@askrjs/ui/progress-circle';
import { Toast, ToastProvider } from '@askrjs/ui/toast';
```

## Identity components

```ts
import { Avatar } from '@askrjs/ui/identity';
```

## Navigation components

```ts
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
} from '@askrjs/ui/breadcrumb';
import {
  Pagination,
  PaginationItem,
  PaginationPrev,
  PaginationNext,
} from '@askrjs/ui/pagination';
import { Menubar, MenubarMenu, MenubarTrigger } from '@askrjs/ui/navigation';
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
} from '@askrjs/ui/navigation';
```

## Layout components

```ts
import {
  Center,
  Container,
  DataTable,
  Grid,
  Inline,
  SidebarLayout,
  Spacer,
  Stack,
  TopbarLayout,
} from '@askrjs/ui/layout';
```

## See also

- [askr-ui overview](./askr-ui.md)
- [Composition](./composition.md)
- [Styling](../styling/askr-themes.md)
