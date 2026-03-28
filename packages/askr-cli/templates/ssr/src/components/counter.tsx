import { state, derive } from '@askrjs/askr';
import { Button } from '@askrjs/askr-ui/button';
import { Badge } from '@askrjs/askr-ui/badge';

export default function Counter() {
  const [count, setCount] = state(0);
  const parity = derive(() => (count() % 2 === 0 ? 'even' : 'odd'));

  return (
    <div class="counter">
      <h2>Interactive Counter</h2>
      <p class="text-muted">
        Built with <code>state()</code> and <code>derive()</code>
      </p>
      <div class="counter-value">{count()}</div>
      <div>
        <Badge>{parity()}</Badge>
      </div>
      <div class="counter-controls">
        <Button onPress={() => setCount((c) => Math.max(0, c - 1))}>
          - Decrement
        </Button>
        <Button onPress={() => setCount((c) => c + 1)}>+ Increment</Button>
      </div>
    </div>
  );
}
