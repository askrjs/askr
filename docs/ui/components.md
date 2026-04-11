# UI: Components

Reference for all `@askrjs/askr-ui` components.

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
} from '@askrjs/askr-ui/foundation';
```

## Focus components

```ts
import { DismissableLayer, FocusRing, FocusScope } from '@askrjs/askr-ui/focus';
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
} from '@askrjs/askr-ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogAction,
  AlertDialogCancel,
} from '@askrjs/askr-ui/alert-dialog';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverPortal,
} from '@askrjs/askr-ui/popover';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@askrjs/askr-ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@askrjs/askr-ui/dropdown-menu';
import { Menu, MenuContent, MenuItem } from '@askrjs/askr-ui/overlay';
```

## Disclosure components

```ts
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@askrjs/askr-ui/accordion';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@askrjs/askr-ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@askrjs/askr-ui/tabs';
```

## Status components

```ts
import { Badge } from '@askrjs/askr-ui/badge';
import { Spinner } from '@askrjs/askr-ui/spinner';
import { Skeleton } from '@askrjs/askr-ui/skeleton';
import { Progress } from '@askrjs/askr-ui/progress';
import { ProgressCircle } from '@askrjs/askr-ui/progress-circle';
import { Toast, ToastProvider } from '@askrjs/askr-ui/toast';
```

## Identity components

```ts
import { Avatar } from '@askrjs/askr-ui/identity';
```

## Navigation components

```ts
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
} from '@askrjs/askr-ui/breadcrumb';
import {
  Pagination,
  PaginationItem,
  PaginationPrev,
  PaginationNext,
} from '@askrjs/askr-ui/pagination';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
} from '@askrjs/askr-ui/navigation';
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
} from '@askrjs/askr-ui/navigation';
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
} from '@askrjs/askr-ui/layout';
```

## See also

- [askr-ui overview](./askr-ui.md)
- [Composition](./composition.md)
- [Styling](../styling/askr-themes.md)
