import { state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';
import { createRouteRegistry, route } from '@askrjs/askr/router';

export interface NameFieldProps {
  id: string;
  label: string;
  description: string;
  onEdit?: () => void;
}

export function NameField(props: NameFieldProps) {
  const value = state('');
  const labelId = `${props.id}-label`;
  const descriptionId = `${props.id}-description`;
  return (
    <div>
      <label id={labelId} htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        value={value()}
        onInput={(event: Event) => {
          value.set((event.currentTarget as HTMLInputElement).value);
          props.onEdit?.();
        }}
      />
      <p id={descriptionId}>{props.description}</p>
      <output>{value()}</output>
    </div>
  );
}

export function createIdScreen(namespace: string, keys = ['alpha', 'beta']) {
  let reverse = () => {};
  let edits = 0;
  const Screen = () => {
    const records = state(keys);
    reverse = () => records.set([...records()].reverse());
    return (
      <main>
        <For each={records} by={(key) => key}>
          {(key) => (
            <NameField
              id={`${namespace}:${encodeURIComponent(key)}:display-name`}
              label={`Display name ${key}`}
              description={`Visible to ${key} teammates`}
              onEdit={() => {
                edits += 1;
              }}
            />
          )}
        </For>
      </main>
    );
  };
  return { Screen, reverse: () => reverse(), edits: () => edits };
}

export function idRegistry(component: () => ReturnType<typeof NameField>) {
  return createRouteRegistry(() => route(window.location.pathname, component));
}
