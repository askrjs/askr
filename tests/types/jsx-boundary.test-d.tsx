import type { JSX as AskrJSX } from '@askrjs/askr/jsx-runtime';

const intrinsic: AskrJSX.Element = <button>ok</button>;
void intrinsic;

// @ts-expect-error A misspelled standard tag is not a custom element.
const typo = <buttton />;
void typo;

const customElement = <my-widget attr:config="ok" />;
void customElement;

// @ts-expect-error Askr JSX types are scoped to jsxImportSource.
type GlobalAskrElement = JSX.Element;
void ({} as GlobalAskrElement);
