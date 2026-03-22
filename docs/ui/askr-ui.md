# UI: askr-ui

`@askrjs/askr-ui` provides headless UI primitives for Askr applications.

## What askr-ui is

askr-ui implements interaction behavior and accessibility patterns. It does not impose any
visual styling. Pair it with `askr-themes` for visual defaults, or supply your own CSS.

## Component categories

| Category   | Components                                                            |
| ---------- | --------------------------------------------------------------------- |
| Form       | Button, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Slider |
| Overlay    | Dialog, AlertDialog, Popover, Tooltip, DropdownMenu, Menu, Menubar    |
| Disclosure | Accordion, Collapsible, Tabs                                          |
| Navigation | NavigationMenu, Breadcrumb, Pagination                                |
| Feedback   | Progress, ProgressCircle, Toast, Skeleton, Badge, Spinner             |
| Layout     | Stack, Inline, Grid, Container, Center, Spacer, Separator             |
| Identity   | Avatar                                                                |

## Import style

Components are importable per-subpath for tree-shaking:

```ts
import { Button } from '@askrjs/askr-ui/button';
import { Dialog, DialogTrigger, DialogContent } from '@askrjs/askr-ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@askrjs/askr-ui/select';
```

## See also

- [Foundations](./foundations.md)
- [Components](./components.md)
- [Composition](./composition.md)
- [Styling: askr-themes](../styling/askr-themes.md)
