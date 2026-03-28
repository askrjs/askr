import { Input } from '@askrjs/askr-ui/input';
import { SearchIcon } from '@askrjs/askr-lucide';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from '@askrjs/askr-ui/select';
import { Button } from '@askrjs/askr-ui/button';
import type { AccountStatus } from '../../lib/mock-data';

export default function AccountFilters(props: {
  query: string;
  status: AccountStatus | 'all';
  onQueryChange: (next: string) => void;
  onStatusChange: (next: AccountStatus | 'all') => void;
  onReset: () => void;
}) {
  const hasFilters = () =>
    props.query.trim().length > 0 || props.status !== 'all';

  return (
    <div class="account-filters">
      <label class="input-row account-search" aria-label="Search accounts">
        <SearchIcon size={15} aria-hidden="true" />
        <Input
          placeholder="Search by name, email, or id"
          value={props.query}
          onInput={(event: Event) =>
            props.onQueryChange((event.target as HTMLInputElement).value)
          }
        />
      </label>

      <Select
        value={props.status}
        onValueChange={(value) =>
          props.onStatusChange(value as AccountStatus | 'all')
        }
      >
        <SelectTrigger aria-label="Status filter">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectPortal>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </SelectPortal>
      </Select>

      <Button onPress={props.onReset} disabled={!hasFilters()}>
        Clear filters
      </Button>
    </div>
  );
}
