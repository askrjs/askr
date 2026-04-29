# UI: askr-ui

`@askrjs/ui` provides headless UI primitives for Askr applications.

## What askr-ui is

askr-ui implements interaction behavior and accessibility patterns. It does not impose any
visual styling. Pair it with `askr-themes` for visual defaults, or supply your own CSS.

## Component categories

| Category   | Components                                                                                                                          | Import path             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Foundation | Button, Toggle, Checkbox, VisuallyHidden, Separator, Label, Input, Textarea, Field, RadioGroup, Switch, Select, Slider, ToggleGroup | `@askrjs/ui/foundation` |
| Focus      | FocusRing, FocusScope, DismissableLayer                                                                                             | `@askrjs/ui/focus`      |
| Overlay    | Dialog, AlertDialog, Popover, Tooltip, DropdownMenu, Menu                                                                           | `@askrjs/ui/overlay`    |
| Disclosure | Accordion, Collapsible, Tabs                                                                                                        | `@askrjs/ui/disclosure` |
| Status     | Badge, Progress, ProgressCircle, Toast, Skeleton, Spinner                                                                           | `@askrjs/ui/status`     |
| Identity   | Avatar                                                                                                                              | `@askrjs/ui/identity`   |
| Navigation | Breadcrumb, Pagination, Menubar, NavigationMenu                                                                                     | `@askrjs/ui/navigation` |
| Layout     | Container, Stack, Inline, Grid, Center, Spacer, SidebarLayout, TopbarLayout, DataTable                                              | `@askrjs/ui/layout`     |

## Import style

Components are importable per-subpath for tree-shaking:

```ts
import { Button } from '@askrjs/ui/button';
import { Dialog, DialogTrigger, DialogContent } from '@askrjs/ui/dialog';
import { Button, Input, Field } from '@askrjs/ui/foundation';
import { Dialog, Menu } from '@askrjs/ui/overlay';
import { Menubar, NavigationMenu } from '@askrjs/ui/navigation';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@askrjs/ui/select';
```

## See also

- [Foundations](./foundations.md)
- [Components](./components.md)
- [Composition](./composition.md)
- [Styling: askr-themes](../styling/askr-themes.md)
