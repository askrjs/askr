/**
 * Common call contracts: Props
 *
 * This file holds structural types shared across multiple modules.
 */

/**
 * Props accepted by components and elements.
 * Intentionally permissive but provides a single named type.
 */
export interface Props {
  /** Optional key for keyed lists (string | number | symbol for internal frames) */
  key?: string | number | symbol;
  /** Optional children slot */
  children?: unknown;
  /** Allow additional arbitrary attributes (e.g., class, id, data-*) */
  [attr: string]: unknown;
}

type ReactiveProp<T> = T | (() => T);

type BivariantHandler<T> = {
  bivarianceHack(value: T): void;
}['bivarianceHack'];

type IntrinsicClassValue = string | null | undefined | false;
type IntrinsicAriaValue = string | number | boolean | null | undefined;
type IntrinsicDataValue = string | number | boolean | null | undefined;
type IntrinsicBooleanValue = boolean | null | undefined;
type IntrinsicNumberValue = number | null | undefined;
type IntrinsicTextValue = string | null | undefined;
type IntrinsicTextLikeValue = string | number | null | undefined;
type IntrinsicStyleEntryValue = string | number | null | undefined | false;
type IntrinsicStyleObject = Record<string, IntrinsicStyleEntryValue>;
type IntrinsicStyleValue =
  | string
  | IntrinsicStyleObject
  | null
  | undefined
  | false;
type IntrinsicFormValue =
  | string
  | number
  | readonly string[]
  | null
  | undefined;
type IntrinsicRefTarget = Element | null;
type IntrinsicRef =
  | BivariantHandler<IntrinsicRefTarget>
  | { current: IntrinsicRefTarget }
  | null
  | undefined;

interface IntrinsicEventProps {
  onAbort?: BivariantHandler<Event>;
  onBlur?: BivariantHandler<FocusEvent>;
  onChange?: BivariantHandler<Event>;
  onClick?: BivariantHandler<MouseEvent>;
  onDblClick?: BivariantHandler<MouseEvent>;
  onFocus?: BivariantHandler<FocusEvent>;
  onInput?: BivariantHandler<InputEvent>;
  onKeyDown?: BivariantHandler<KeyboardEvent>;
  onKeyUp?: BivariantHandler<KeyboardEvent>;
  onMouseDown?: BivariantHandler<MouseEvent>;
  onMouseEnter?: BivariantHandler<MouseEvent>;
  onMouseLeave?: BivariantHandler<MouseEvent>;
  onMouseMove?: BivariantHandler<MouseEvent>;
  onMouseOut?: BivariantHandler<MouseEvent>;
  onMouseOver?: BivariantHandler<MouseEvent>;
  onMouseUp?: BivariantHandler<MouseEvent>;
  onPointerDown?: BivariantHandler<PointerEvent>;
  onPointerDownCapture?: BivariantHandler<PointerEvent>;
  onPointerEnter?: BivariantHandler<PointerEvent>;
  onPointerLeave?: BivariantHandler<PointerEvent>;
  onPointerMove?: BivariantHandler<PointerEvent>;
  onPointerUp?: BivariantHandler<PointerEvent>;
  onScroll?: BivariantHandler<Event>;
  onSubmit?: BivariantHandler<SubmitEvent>;
  onTouchEnd?: BivariantHandler<TouchEvent>;
  onTouchStart?: BivariantHandler<TouchEvent>;
  onWheel?: BivariantHandler<WheelEvent>;
}

/**
 * Props understood specially by intrinsic JSX elements.
 *
 * This stays separate from Props so component-level prop bags can remain
 * intentionally generic while JSX element usage gets stronger contracts.
 */
export interface IntrinsicProps extends IntrinsicEventProps {
  key?: string | number | symbol;
  children?: unknown;
  /**
   * Leaves descendant DOM ownership to an imperative widget after mount.
   * Askr will continue updating the host element's props, events, and ref.
   */
  imperativeChildren?: boolean;
  class?: ReactiveProp<IntrinsicClassValue>;
  className?: ReactiveProp<IntrinsicClassValue>;
  style?: ReactiveProp<IntrinsicStyleValue>;
  ref?: IntrinsicRef;
  id?: ReactiveProp<IntrinsicTextLikeValue>;
  title?: ReactiveProp<IntrinsicTextValue>;
  role?: ReactiveProp<IntrinsicTextValue>;
  tabIndex?: ReactiveProp<IntrinsicNumberValue>;
  hidden?: ReactiveProp<IntrinsicBooleanValue>;
  dir?: ReactiveProp<IntrinsicTextValue>;
  lang?: ReactiveProp<IntrinsicTextValue>;
  [attr: `aria-${string}`]: ReactiveProp<IntrinsicAriaValue>;
  [attr: `data-${string}`]: ReactiveProp<IntrinsicDataValue>;
}

/**
 * Fallback intrinsic props for arbitrary tag names and dynamic prop spreads.
 *
 * This keeps the generic runtime-friendly `Props` bag available where the
 * renderer intentionally accepts unknown attributes, while known high-use
 * elements can be declared more precisely in JSX.IntrinsicElements.
 */
export type IntrinsicFallbackProps = IntrinsicProps & Props;

type ForbiddenLayoutOnlyProps = {
  action?: never;
  alt?: never;
  abbr?: never;
  autoComplete?: never;
  autocomplete?: never;
  checked?: never;
  colSpan?: never;
  cols?: never;
  disabled?: never;
  form?: never;
  headers?: never;
  height?: never;
  href?: never;
  htmlFor?: never;
  label?: never;
  method?: never;
  multiple?: never;
  name?: never;
  noValidate?: never;
  placeholder?: never;
  rel?: never;
  required?: never;
  rowSpan?: never;
  rows?: never;
  scope?: never;
  selected?: never;
  src?: never;
  target?: never;
  type?: never;
  value?: never;
  width?: never;
};

type StructuredContentIntrinsicProps<TAllowed extends object = {}> =
  IntrinsicFallbackProps &
    Omit<ForbiddenLayoutOnlyProps, keyof TAllowed> &
    TAllowed;

export type LayoutIntrinsicProps = StructuredContentIntrinsicProps;

export type OrderedListIntrinsicProps = StructuredContentIntrinsicProps<{
  reversed?: ReactiveProp<IntrinsicBooleanValue>;
  start?: ReactiveProp<IntrinsicNumberValue>;
  type?: ReactiveProp<IntrinsicTextValue>;
}>;

export type ListItemIntrinsicProps = StructuredContentIntrinsicProps<{
  value?: ReactiveProp<IntrinsicNumberValue>;
}>;

type TableCellIntrinsicAllowedProps = {
  colSpan?: ReactiveProp<IntrinsicNumberValue>;
  headers?: ReactiveProp<IntrinsicTextValue>;
  rowSpan?: ReactiveProp<IntrinsicNumberValue>;
};

type TableHeaderScopeValue =
  | 'col'
  | 'colgroup'
  | 'row'
  | 'rowgroup'
  | null
  | undefined;

export type TableCellIntrinsicProps =
  StructuredContentIntrinsicProps<TableCellIntrinsicAllowedProps>;

export type TableHeaderIntrinsicProps = StructuredContentIntrinsicProps<
  TableCellIntrinsicAllowedProps & {
    abbr?: ReactiveProp<IntrinsicTextValue>;
    scope?: ReactiveProp<TableHeaderScopeValue>;
  }
>;

export interface AnchorIntrinsicProps extends IntrinsicProps {
  href?: ReactiveProp<IntrinsicTextValue>;
  rel?: ReactiveProp<IntrinsicTextValue>;
  target?: ReactiveProp<IntrinsicTextValue>;
}

export interface ButtonIntrinsicProps extends IntrinsicProps {
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  type?: ReactiveProp<IntrinsicTextValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}

export interface FormIntrinsicProps extends IntrinsicProps {
  action?: ReactiveProp<IntrinsicTextValue>;
  autoComplete?: ReactiveProp<IntrinsicTextValue>;
  autocomplete?: ReactiveProp<IntrinsicTextValue>;
  method?: ReactiveProp<IntrinsicTextValue>;
  noValidate?: ReactiveProp<IntrinsicBooleanValue>;
}

export interface ImageIntrinsicProps extends IntrinsicProps {
  alt?: ReactiveProp<IntrinsicTextValue>;
  height?: ReactiveProp<IntrinsicTextLikeValue>;
  src?: ReactiveProp<IntrinsicTextValue>;
  width?: ReactiveProp<IntrinsicTextLikeValue>;
}

export interface InputIntrinsicProps extends IntrinsicProps {
  autoComplete?: ReactiveProp<IntrinsicTextValue>;
  autocomplete?: ReactiveProp<IntrinsicTextValue>;
  checked?: ReactiveProp<IntrinsicBooleanValue>;
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  placeholder?: ReactiveProp<IntrinsicTextValue>;
  required?: ReactiveProp<IntrinsicBooleanValue>;
  type?: ReactiveProp<IntrinsicTextValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}

export interface LabelIntrinsicProps extends IntrinsicProps {
  htmlFor?: ReactiveProp<IntrinsicTextValue>;
}

export type OutputIntrinsicProps = StructuredContentIntrinsicProps<{
  form?: ReactiveProp<IntrinsicTextValue>;
  htmlFor?: ReactiveProp<IntrinsicTextValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
}>;

type SvgPresentationIntrinsicAllowedProps = {
  clipRule?: ReactiveProp<IntrinsicTextValue>;
  fill?: ReactiveProp<IntrinsicTextValue>;
  fillRule?: ReactiveProp<IntrinsicTextValue>;
  stroke?: ReactiveProp<IntrinsicTextValue>;
  strokeLinecap?: ReactiveProp<IntrinsicTextValue>;
  strokeLinejoin?: ReactiveProp<IntrinsicTextValue>;
  strokeWidth?: ReactiveProp<IntrinsicTextLikeValue>;
};

export type SvgIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    height?: ReactiveProp<IntrinsicTextLikeValue>;
    viewBox?: ReactiveProp<IntrinsicTextValue>;
    width?: ReactiveProp<IntrinsicTextLikeValue>;
    xmlns?: ReactiveProp<IntrinsicTextValue>;
  }
>;

export type SvgCircleIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    cx?: ReactiveProp<IntrinsicTextLikeValue>;
    cy?: ReactiveProp<IntrinsicTextLikeValue>;
    r?: ReactiveProp<IntrinsicTextLikeValue>;
  }
>;

export type SvgGroupIntrinsicProps =
  StructuredContentIntrinsicProps<SvgPresentationIntrinsicAllowedProps>;

export type SvgPathIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    d?: ReactiveProp<IntrinsicTextValue>;
  }
>;

export type SvgRectIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    height?: ReactiveProp<IntrinsicTextLikeValue>;
    rx?: ReactiveProp<IntrinsicTextLikeValue>;
    ry?: ReactiveProp<IntrinsicTextLikeValue>;
    width?: ReactiveProp<IntrinsicTextLikeValue>;
    x?: ReactiveProp<IntrinsicTextLikeValue>;
    y?: ReactiveProp<IntrinsicTextLikeValue>;
  }
>;

export interface OptionIntrinsicProps extends IntrinsicProps {
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  label?: ReactiveProp<IntrinsicTextValue>;
  selected?: ReactiveProp<IntrinsicBooleanValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}

export interface SelectIntrinsicProps extends IntrinsicProps {
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  multiple?: ReactiveProp<IntrinsicBooleanValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  required?: ReactiveProp<IntrinsicBooleanValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}

export interface TextareaIntrinsicProps extends IntrinsicProps {
  autoComplete?: ReactiveProp<IntrinsicTextValue>;
  autocomplete?: ReactiveProp<IntrinsicTextValue>;
  cols?: ReactiveProp<IntrinsicNumberValue>;
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  placeholder?: ReactiveProp<IntrinsicTextValue>;
  required?: ReactiveProp<IntrinsicBooleanValue>;
  rows?: ReactiveProp<IntrinsicNumberValue>;
  value?: ReactiveProp<IntrinsicTextValue>;
}

export interface KnownIntrinsicElementProps {
  a: AnchorIntrinsicProps;
  article: LayoutIntrinsicProps;
  aside: LayoutIntrinsicProps;
  blockquote: LayoutIntrinsicProps;
  button: ButtonIntrinsicProps;
  caption: LayoutIntrinsicProps;
  circle: SvgCircleIntrinsicProps;
  code: LayoutIntrinsicProps;
  div: LayoutIntrinsicProps;
  em: LayoutIntrinsicProps;
  figcaption: LayoutIntrinsicProps;
  figure: LayoutIntrinsicProps;
  form: FormIntrinsicProps;
  footer: LayoutIntrinsicProps;
  g: SvgGroupIntrinsicProps;
  h1: LayoutIntrinsicProps;
  h2: LayoutIntrinsicProps;
  h3: LayoutIntrinsicProps;
  h4: LayoutIntrinsicProps;
  h5: LayoutIntrinsicProps;
  h6: LayoutIntrinsicProps;
  header: LayoutIntrinsicProps;
  img: ImageIntrinsicProps;
  input: InputIntrinsicProps;
  label: LabelIntrinsicProps;
  li: ListItemIntrinsicProps;
  main: LayoutIntrinsicProps;
  nav: LayoutIntrinsicProps;
  ol: OrderedListIntrinsicProps;
  option: OptionIntrinsicProps;
  output: OutputIntrinsicProps;
  p: LayoutIntrinsicProps;
  path: SvgPathIntrinsicProps;
  pre: LayoutIntrinsicProps;
  rect: SvgRectIntrinsicProps;
  section: LayoutIntrinsicProps;
  select: SelectIntrinsicProps;
  small: LayoutIntrinsicProps;
  span: LayoutIntrinsicProps;
  strong: LayoutIntrinsicProps;
  svg: SvgIntrinsicProps;
  table: LayoutIntrinsicProps;
  tbody: LayoutIntrinsicProps;
  td: TableCellIntrinsicProps;
  tfoot: LayoutIntrinsicProps;
  th: TableHeaderIntrinsicProps;
  thead: LayoutIntrinsicProps;
  textarea: TextareaIntrinsicProps;
  title: LayoutIntrinsicProps;
  tr: LayoutIntrinsicProps;
  ul: LayoutIntrinsicProps;
}

export interface ComponentNode {
  type: 'component' | 'element' | 'text';
  value?: unknown;
  children?: ComponentNode[];
}
