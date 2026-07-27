import { expectAssignable, expectError, expectType } from 'tsd';
import {
  Fragment as RootFragment,
  createRef,
  type Props,
  type Ref,
  jsx as rootJsx,
  jsxs as rootJsxs,
} from '@askrjs/askr';

const buttonRef = createRef<HTMLButtonElement>();
expectType<Ref<HTMLButtonElement>>(buttonRef);
import {
  Fragment,
  jsx,
  jsxs,
  type JSX as RuntimeJSX,
  type JSXComponent,
  type JSXElement,
  type JSXElementType,
} from '@askrjs/askr/jsx-runtime';
import {
  jsxDEV,
  type JSX as DevRuntimeJSX,
} from '@askrjs/askr/jsx-dev-runtime';

expectAssignable<typeof jsx>(rootJsx);
expectAssignable<typeof jsxs>(rootJsxs);
expectAssignable<symbol>(RootFragment);
expectAssignable<symbol>(Fragment);
expectAssignable<JSXElement>({} as RuntimeJSX.Element);
expectAssignable<JSXElement>({} as DevRuntimeJSX.Element);
expectType<Props>({} as RuntimeJSX.ElementAttributesProperty['props']);
expectType<unknown>({} as RuntimeJSX.ElementChildrenAttribute['children']);
type RuntimeIntrinsicKeysMissingFromGlobal = Exclude<
  keyof RuntimeJSX.KnownIntrinsicElements,
  keyof JSX.IntrinsicElements
>;
type GlobalIntrinsicKeysMissingFromRuntime = Exclude<
  keyof JSX.IntrinsicElements,
  keyof RuntimeJSX.KnownIntrinsicElements
>;
expectType<never>({} as RuntimeIntrinsicKeysMissingFromGlobal);
expectType<never>({} as GlobalIntrinsicKeysMissingFromRuntime);
expectType<RuntimeJSX.IntrinsicElements['output']>(
  {} as JSX.IntrinsicElements['output']
);
expectType<RuntimeJSX.IntrinsicElements['rect']>(
  {} as JSX.IntrinsicElements['rect']
);
expectType<RuntimeJSX.IntrinsicElements['small']>(
  {} as JSX.IntrinsicElements['small']
);
expectType<RuntimeJSX.IntrinsicElements['tfoot']>(
  {} as JSX.IntrinsicElements['tfoot']
);
expectType<RuntimeJSX.IntrinsicElements['title']>(
  {} as JSX.IntrinsicElements['title']
);

const rootProps: Props = {
  id: 'demo',
  children: 'child',
  role: 'button',
};
expectAssignable<Props>(rootProps);

const Badge = ({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'danger';
}) => <span class={tone}>{label}</span>;

const callButton = jsx('button', {
  class: () => 'primary',
  disabled: () => false,
  style: () => ({
    color: 'red',
    zIndex: 1,
    '--gap': '4px',
  }),
  onClick: (event) => {
    expectType<MouseEvent>(event);
  },
  onKeyDown: (event) => {
    expectType<KeyboardEvent>(event);
  },
  onMouseMove: (event) => {
    expectType<MouseEvent>(event);
  },
  onMouseOut: (event) => {
    expectType<MouseEvent>(event);
  },
  onMouseOver: (event) => {
    expectType<MouseEvent>(event);
  },
  onPointerDownCapture: (event) => {
    expectType<PointerEvent>(event);
  },
  ref: (element) => {
    expectType<Element | null>(element);
  },
  value: 'save',
  children: 'go',
});
expectType<JSXElement>(callButton);

const callInput = jsx('input', {
  autocomplete: 'off',
  name: 'firstName',
  placeholder: 'Ada',
  required: true,
  value: () => 'Ada',
  checked: () => true,
  onInput: (event) => {
    expectType<InputEvent>(event);
  },
  onChange: (event) => {
    expectType<Event>(event);
  },
});
expectType<JSXElement>(callInput);

const callLink = jsx('a', {
  href: '/docs',
  rel: 'noreferrer',
  target: '_blank',
  children: 'Docs',
});
expectType<JSXElement>(callLink);

const callForm = jsx('form', {
  action: '/subscribe',
  method: 'POST',
  noValidate: true,
  children: 'form',
});
expectType<JSXElement>(callForm);

const callLabel = jsx('label', {
  htmlFor: 'email',
  children: 'Email',
});
expectType<JSXElement>(callLabel);

const callSection = jsx('section', {
  class: 'shell',
  role: 'region',
  'data-pane': 'main',
  children: jsx('div', {
    className: () => 'body',
    children: jsx('span', { children: 'Body copy' }),
  }),
});
expectType<JSXElement>(callSection);

const callSelect = jsx('select', {
  name: 'role',
  required: true,
  value: 'viewer',
  children: jsx('option', { value: 'viewer', children: 'Viewer' }),
});
expectType<JSXElement>(callSelect);

const callOrderedList = jsx('ol', {
  start: 2,
  reversed: true,
  type: 'A',
  children: jsx('li', { value: 2, children: 'Second' }),
});
expectType<JSXElement>(callOrderedList);

const callTable = jsxs('table', {
  class: 'grid',
  children: [
    jsx('caption', { children: 'Users' }),
    jsx('thead', {
      children: jsx('tr', {
        children: jsx('th', { scope: 'col', children: 'Name' }),
      }),
    }),
    jsx('tbody', {
      children: jsx('tr', {
        children: jsx('td', {
          colSpan: 2,
          children: 'Ada',
        }),
      }),
    }),
  ],
});
expectType<JSXElement>(callTable);

const callTableHeader = jsx('th', {
  scope: 'col',
  abbr: 'User name',
  children: 'Name',
});
expectType<JSXElement>(callTableHeader);

const callTableCell = jsx('td', {
  colSpan: () => 2,
  rowSpan: 1,
  headers: 'user-name',
  children: 'Ada',
});
expectType<JSXElement>(callTableCell);

const callOutput = jsx('output', {
  htmlFor: 'price quantity',
  name: 'total',
  form: 'cart',
  children: '60',
});
expectType<JSXElement>(callOutput);

const callSemanticText = jsx('em', {
  children: jsx('strong', {
    children: jsx('small', { children: 'important' }),
  }),
});
expectType<JSXElement>(callSemanticText);

const callFigure = jsx('figure', {
  children: [
    jsx('figcaption', { children: 'Snippet' }),
    jsx('pre', {
      children: jsx('code', { children: 'const total = 60;' }),
    }),
  ],
});
expectType<JSXElement>(callFigure);

const callSvg = jsx('svg', {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  xmlns: 'http://www.w3.org/2000/svg',
  children: [
    jsx('title', { children: 'Status icon' }),
    jsx('g', {
      stroke: 'currentColor',
      children: jsx('path', {
        d: 'M4 12h16',
        fillRule: 'evenodd',
        clipRule: 'evenodd',
      }),
    }),
    jsx('circle', {
      cx: 12,
      cy: 12,
      r: 10,
      fill: 'none',
    }),
  ],
});
expectType<JSXElement>(callSvg);

const callSvgRect = jsx('rect', {
  x: 2,
  y: 2,
  width: 20,
  height: 20,
  rx: 4,
  ry: 4,
  strokeWidth: () => 2,
});
expectType<JSXElement>(callSvgRect);

const button = jsx('button', {
  class: 'primary',
  disabled: false,
  style: { color: 'red' },
  onClick: () => {},
  ref: { current: null },
  children: 'go',
});
expectType<JSXElement>(button);

const badge = jsx(Badge, {
  label: 'Alert',
  tone: 'danger',
});
expectType<JSXElement>(badge);
expectAssignable<JSXComponent>(Badge);
expectAssignable<JSXElementType>(Badge);

declare const publicElement: JSXElement;
if (typeof publicElement.type === 'function') {
  expectType<unknown>(publicElement.type(publicElement.props));
  expectType<unknown>(publicElement.type({ children: 'child' }));
}

const fragment = jsxs(Fragment, {
  children: [jsx('span', { children: 'a' }), jsx('span', { children: 'b' })],
});
expectType<JSXElement>(fragment);

const devButton = jsxDEV(
  'button',
  {
    class: 'secondary',
    style: { color: 'blue' },
    children: 'dev',
  },
  'key'
);
expectType<JSXElement>(devButton);

expectAssignable<JSXElement>(<div class="demo">demo</div>);
expectAssignable<JSXElement>(<Badge label="Alert" tone="danger" />);
expectAssignable<JSXElement>(
  <main class="page-shell" data-layout="app">
    <header role="banner">
      <h1>Dashboard</h1>
    </header>
    <section aria-label="content">
      <article>
        <p>Welcome</p>
      </article>
    </section>
    <footer>Footer</footer>
  </main>
);
expectAssignable<JSXElement>(
  <button
    class={() => 'demo'}
    disabled={false}
    style={() => ({ color: 'red', zIndex: 1 })}
    onClick={(event) => {
      expectType<MouseEvent>(event);
    }}
    onInput={(event) => {
      expectType<InputEvent>(event);
    }}
    onMouseOver={(event) => {
      expectType<MouseEvent>(event);
    }}
    onPointerDownCapture={(event) => {
      expectType<PointerEvent>(event);
    }}
    ref={(element: HTMLButtonElement | null) => {
      expectType<HTMLButtonElement | null>(element);
    }}
    type="button"
  >
    click
  </button>
);
expectAssignable<JSXElement>(
  <form action="/submit" method="POST" noValidate>
    <input
      autocomplete="off"
      name="email"
      placeholder="you@example.com"
      required
      type="email"
    />
    <button type="submit">Submit</button>
  </form>
);
expectAssignable<JSXElement>(
  <table class="people-table">
    <caption>People</caption>
    <thead>
      <tr>
        <th scope="col" abbr="User name">
          Name
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colSpan={2} rowSpan={1} headers="user-name">
          Ada
        </td>
      </tr>
    </tbody>
  </table>
);
expectAssignable<JSXElement>(
  <output htmlFor="price quantity" name="total" form="cart">
    60
  </output>
);
expectAssignable<JSXElement>(
  <blockquote>
    <p>
      This is <em>important</em> and <strong>intentional</strong>.
    </p>
  </blockquote>
);
expectAssignable<JSXElement>(
  <figure>
    <figcaption>Snippet</figcaption>
    <pre>
      <code>const total = 60;</code>
    </pre>
  </figure>
);
expectAssignable<JSXElement>(
  <svg
    viewBox="0 0 24 24"
    width={24}
    height={24}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Status icon</title>
    <g stroke="currentColor">
      <path d="M4 12h16" fillRule="evenodd" clipRule="evenodd" />
      <circle cx={12} cy={12} r={10} fill="none" />
      <rect x={2} y={2} width={20} height={20} rx={4} ry={4} />
    </g>
  </svg>
);
expectAssignable<JSXElement>(
  <ol start={2} reversed type="A">
    <li value={2}>Second</li>
  </ol>
);
expectAssignable<JSXElement>(
  <a href="/docs" rel="noreferrer" target="_blank">
    docs
  </a>
);
expectAssignable<JSXElement>(
  <>
    <span>a</span>
    <span>b</span>
  </>
);

expectError(jsx('button', { onClick: 'nope' }));
expectError(jsx('button', { onMouseOver: 'nope' }));
expectError(jsx('button', { href: '/docs' }));
expectError(jsx('button', { disabled: 'yes' }));
expectError(jsx('button', { ref: 123 }));
expectError(jsx('a', { href: 123 }));
expectError(jsx('div', { style: ['red'] }));
expectError(jsx('div', { href: '/docs' }));
expectError(jsx('section', { disabled: true }));
expectError(jsx('span', { checked: true }));
expectError(jsx('article', { src: '/hero.png' }));
expectError(jsx('ul', { href: '/docs' }));
expectError(jsx('table', { disabled: true }));
expectError(jsx('caption', { src: '/hero.png' }));
expectError(jsx('td', { method: 'POST' }));
expectError(jsx('td', { colSpan: '2' }));
expectError(jsx('td', { scope: 'col' }));
expectError(jsx('th', { checked: true }));
expectError(jsx('th', { scope: 'column' }));
expectError(jsx('th', { abbr: 123 }));
expectError(jsx('output', { htmlFor: 5 }));
expectError(jsx('output', { href: '/docs' }));
expectError(jsx('output', { form: true }));
expectError(jsx('ol', { start: 'first' }));
expectError(jsx('li', { value: '2' }));
expectError(jsx('p', { method: 'POST' }));
expectError(jsx('div', { rowSpan: 2 }));
expectError(jsx('em', { disabled: true }));
expectError(jsx('code', { src: '/snippet.txt' }));
expectError(jsx('pre', { checked: true }));
expectError(jsx('small', { href: '/docs' }));
expectError(jsx('figure', { htmlFor: 'email' }));
expectError(jsx('svg', { href: '/docs' }));
expectError(jsx('svg', { strokeWidth: true }));
expectError(jsx('circle', { cx: true }));
expectError(jsx('path', { d: 5 }));
expectError(jsx('rect', { width: false }));
expectError(jsx('g', { checked: true }));
expectError(jsx('form', { method: 123 }));
expectError(jsx('input', { value: () => ({ bad: true }) }));
expectError(jsx('input', { checked: 'yes' }));
expectError(jsx('input', { required: 'true' }));
expectError(jsx('label', { htmlFor: 5 }));
expectError(jsx(Badge, { label: 42 }));
