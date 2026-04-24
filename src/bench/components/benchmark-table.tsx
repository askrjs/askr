import { For, type State } from '../../index';
import { BenchmarkRow, type BenchmarkRowData } from './benchmark-row';

interface BenchmarkTableProps {
  rows: State<BenchmarkRowData[]>;
  isSelected: (id: number) => boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

export function BenchmarkTable({
  rows,
  isSelected,
  onSelect,
  onRemove,
}: BenchmarkTableProps) {
  return (
    <table class="table table-hover table-striped test-data">
      <tbody>
        {
          <For each={() => rows()} by={(item) => item.id}>
            {(item) => (
              <BenchmarkRow
                item={item}
                isSelected={isSelected}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            )}
          </For>
        }
      </tbody>
    </table>
  );
}
