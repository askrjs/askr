export interface BenchmarkRowData {
  id: number;
  label: string;
}

interface BenchmarkRowProps {
  item: BenchmarkRowData;
  isSelected: (id: number) => boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

export function BenchmarkRow({
  item,
  isSelected,
  onSelect,
  onRemove,
}: BenchmarkRowProps) {
  return (
    <tr class={() => (isSelected(item.id) ? 'danger' : '')}>
      <td key="id" class="col-md-1">
        {item.id}
      </td>
      <td key="label" class="col-md-4">
        <a
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            onSelect(item.id);
          }}
        >
          {item.label}
        </a>
      </td>
      <td key="remove" class="col-md-1">
        <a
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            onRemove(item.id);
          }}
        >
          <span class="glyphicon glyphicon-remove" aria-hidden="true" />
        </a>
      </td>
      <td key="spacer" class="col-md-6" />
    </tr>
  );
}
