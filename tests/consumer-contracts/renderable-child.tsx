import { defineScope, type RenderableChild } from '@askrjs/askr';
import {
  Presence,
  layout,
  type LayoutComponent,
} from '@askrjs/askr/foundations';
import type { JSX } from '@askrjs/askr/jsx-runtime';

function Panel({ children }: { children?: RenderableChild }): JSX.Element {
  return <section>{children}</section>;
}

const element: RenderableChild = <strong>element</strong>;
const readonlyChildren: readonly RenderableChild[] = Object.freeze([
  'text',
  0,
  42,
  true,
  false,
  null,
  undefined,
  element,
  Object.freeze(['nested', Object.freeze([1, null, element])]),
]);
const nested: RenderableChild = readonlyChildren;
const Scope = defineScope('default');
const shell: LayoutComponent<{ label: string }> = ({ label, children }) => (
  <main aria-label={label}>{children}</main>
);
const wrap = layout(shell);

for (const children of readonlyChildren) {
  Presence({ present: true, children });
  wrap(children, { label: 'layout slot' });
  Scope({ value: 'provided', children });
  Panel({ children });
  <Panel>{children}</Panel>;
}
<Panel>{nested}</Panel>;

// Scope explicitly owns factory children; value-only presentation slots do not.
Scope({ value: 'provided', children: () => nested });
<Scope value="provided">{() => nested}</Scope>;

// @ts-expect-error Arbitrary data objects are not presentation values.
const object: RenderableChild = { label: 'data' };
// @ts-expect-error A function returning content is not a value child.
const factory: RenderableChild = () => element;
// @ts-expect-error Functions remain unsupported when nested in an array.
const nestedFactory: RenderableChild = Object.freeze([() => element]);
// @ts-expect-error Imperative DOM nodes are not JSX children.
const node: RenderableChild = document.createElement('div');
// @ts-expect-error Promises need an explicit asynchronous owner.
const promise: RenderableChild = Promise.resolve(element);
// @ts-expect-error Bigint is outside the supported value-child contract.
const bigint: RenderableChild = 1n;
// @ts-expect-error Generic iterables are outside the supported value-child contract.
const iterable: RenderableChild = new Set(['text']);
// @ts-expect-error Presence accepts values, not child factories.
Presence({ present: true, children: () => element });
// @ts-expect-error Layout's child position accepts values, not child factories.
wrap(() => element, { label: 'invalid factory' });
// @ts-expect-error JSX presentation props retain the value-only boundary.
<Panel>{() => element}</Panel>;
// @ts-expect-error JSX presentation props reject arbitrary data objects.
<Panel>{{ label: 'data' }}</Panel>;
void [object, factory, nestedFactory, node, promise, bigint, iterable];
