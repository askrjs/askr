import { expectAssignable, expectType } from 'tsd';
import {
  Fragment as RootFragment,
  type Props,
  jsx as rootJsx,
  jsxs as rootJsxs,
} from '@askrjs/askr';
import { Fragment, jsx, jsxs, type JSXElement } from '@askrjs/askr/jsx-runtime';
import { jsxDEV } from '@askrjs/askr/jsx-dev-runtime';

expectAssignable<typeof jsx>(rootJsx);
expectAssignable<typeof jsxs>(rootJsxs);
expectAssignable<symbol>(RootFragment);
expectAssignable<symbol>(Fragment);

const rootProps: Props = {
  id: 'demo',
  children: 'child',
  role: 'button',
};
expectAssignable<Props>(rootProps);

const button = jsx('button', {
  class: 'primary',
  style: { color: 'red' },
  onClick: () => {},
  ref: { current: null },
  children: 'go',
});
expectType<JSXElement>(button);

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
expectAssignable<JSXElement>(
  <button
    class="demo"
    style={{ color: 'red' }}
    onClick={() => {}}
    ref={{ current: null }}
  >
    click
  </button>
);
expectAssignable<JSXElement>(
  <>
    <span>a</span>
    <span>b</span>
  </>
);
