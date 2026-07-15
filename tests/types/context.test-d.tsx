import { expectAssignable, expectError, expectType } from 'tsd';
import { defineScope, readScope, type Scope } from '@askrjs/askr';
import type { JSXElement } from '@askrjs/askr/foundations';

const ThemeScope = defineScope('light');
expectType<Scope<string>>(ThemeScope);
expectType<string>(readScope(ThemeScope));

const ColorScope = defineScope<'light' | 'dark'>('light');
expectAssignable<Scope<'light' | 'dark'>>(ColorScope);
expectType<'light' | 'dark'>(readScope(ColorScope));

expectAssignable<JSXElement>(
  <ColorScope value="dark">
    <span>dark</span>
  </ColorScope>
);

expectAssignable<JSXElement>(
  <ColorScope value="dark">{() => <span>dark</span>}</ColorScope>
);

expectAssignable<JSXElement>(<ColorScope value="dark">{() => 0}</ColorScope>);

expectAssignable<JSXElement>(<ThemeScope value="dark" />);

expectError(
  <ColorScope value="blue">
    <span>bad</span>
  </ColorScope>
);

expectError(
  <ColorScope value="dark">{document.createElement('div')}</ColorScope>
);

expectError(
  <ColorScope value="dark">{() => document.createElement('div')}</ColorScope>
);

const NumberScope = defineScope(123);
expectType<Scope<number>>(NumberScope);
expectType<number>(readScope(NumberScope));

expectError(readScope({ defaultValue: 'light' }));
