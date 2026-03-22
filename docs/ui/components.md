# UI: Components

Reference for all `@askrjs/askr-ui` components.

> Detailed per-component docs are a work in progress. This page provides import paths
> and links to the interactive examples on the website.

## Form components

```ts
import { Button } from '@askrjs/askr-ui/button';
import { Input } from '@askrjs/askr-ui/input';
import { Textarea } from '@askrjs/askr-ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectPortal,
} from '@askrjs/askr-ui/select';
import { Checkbox } from '@askrjs/askr-ui/checkbox';
import { Switch } from '@askrjs/askr-ui/switch';
import { RadioGroup, RadioGroupItem } from '@askrjs/askr-ui/radio-group';
import { Slider } from '@askrjs/askr-ui/slider';
import { Field, FieldLabel } from '@askrjs/askr-ui/field';
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
```

## Feedback components

```ts
import { Badge } from '@askrjs/askr-ui/badge';
import { Spinner } from '@askrjs/askr-ui/spinner';
import { Skeleton } from '@askrjs/askr-ui/skeleton';
import { Progress } from '@askrjs/askr-ui/progress';
import { Toast, ToastProvider } from '@askrjs/askr-ui/toast';
```

## Layout components

```ts
import { Stack } from '@askrjs/askr-ui/stack';
import { Inline } from '@askrjs/askr-ui/inline';
import { Container } from '@askrjs/askr-ui/container';
import { Separator } from '@askrjs/askr-ui/separator';
```

## See also

- [askr-ui overview](./askr-ui.md)
- [Composition](./composition.md)
- [Styling](../styling/askr-themes.md)
