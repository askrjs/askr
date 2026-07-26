/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';
import { For } from '@askrjs/askr/control';
import { Slot } from '@askrjs/askr/foundations';
import { Link } from '@askrjs/askr/router';

const Container = (props: { children?: unknown; class?: string }) => (
  <div class={props.class}>{props.children}</div>
);

const Badge = (props: { children: JSX.Element }) => (
  <Slot asChild class="topic-button" children={props.children} />
);

const CalloutLink = (props: { id: string }) => (
  <Badge>
    <Link href={`/${props.id}`} data-link={props.id}>
      {props.id}
    </Link>
  </Badge>
);

function AdjacentForBoundaries() {
  const revision = state(0);

  return (
    <div data-revision={revision()}>
      <button
        type="button"
        onClick={() => revision.set((current) => current + 1)}
      >
        Rerender adjacent lists
      </button>
      <For
        each={[
          { id: 'what', body: 'What body' },
          { id: 'fit', body: 'Fit body' },
        ]}
        by={(item) => item.id}
      >
        {(item) => (
          <section data-row={item.id}>
            <Container class="prose-stack">
              <p>{item.body}</p>
              <CalloutLink id={item.id} />
            </Container>
          </section>
        )}
      </For>
      <section>
        <Container class="evidence-grid">
          <For each={[{ id: 'a' }, { id: 'b' }]} by={(item) => item.id}>
            {(item) => <article data-work={item.id}>{item.id}</article>}
          </For>
        </Container>
      </section>
    </div>
  );
}

export function mountAdjacentForBoundariesScenario(root: HTMLElement): void {
  createIsland({ root, component: AdjacentForBoundaries });
}
