import { expectAssignable, expectError, expectType } from 'tsd';
import { defineContext, readContext, type Context } from '@askrjs/askr';
import type { JSXElement } from '@askrjs/askr/foundations';

const ThemeContext = defineContext('light');
expectType<Context<string>>(ThemeContext);
expectType<string>(readContext(ThemeContext));

const ColorContext = defineContext<'light' | 'dark'>('light');
expectAssignable<Context<'light' | 'dark'>>(ColorContext);
expectType<'light' | 'dark'>(readContext(ColorContext));

expectAssignable<JSXElement>(
  <ColorContext.Scope value="dark">
    <span>dark</span>
  </ColorContext.Scope>
);

expectAssignable<JSXElement>(
  <ColorContext.Scope value="dark">
    {() => <span>dark</span>}
  </ColorContext.Scope>
);

expectAssignable<JSXElement>(
  <ColorContext.Scope value="dark">{() => 0}</ColorContext.Scope>
);

expectAssignable<JSXElement>(<ThemeContext.Scope value="dark" />);

expectError(
  <ColorContext.Scope value="blue">
    <span>bad</span>
  </ColorContext.Scope>
);

expectError(
  <ColorContext.Scope value="dark">
    {document.createElement('div')}
  </ColorContext.Scope>
);

expectError(
  <ColorContext.Scope value="dark">
    {() => document.createElement('div')}
  </ColorContext.Scope>
);

const NumberContext = defineContext(123);
expectType<Context<number>>(NumberContext);
expectType<number>(readContext(NumberContext));

expectError(readContext({ defaultValue: 'light' }));
