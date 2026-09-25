/**
 * Common call contracts: Props
 *
 * This file holds structural types shared across multiple modules.
 */
/**
 * Props accepted by components and elements.
 * Intentionally permissive but provides a single named type.
 */
interface Props {
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
/** Enumerated attributes where `false` renders `"false"` (see keepsFalseValue). */
type IntrinsicEnumeratedValue = string | boolean | null | undefined;
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
  | {
      current: IntrinsicRefTarget;
    }
  | null
  | undefined;
interface IntrinsicEventProps {
  onAbort?: BivariantHandler<Event> | null;
  onBlur?: BivariantHandler<FocusEvent> | null;
  onChange?: BivariantHandler<Event> | null;
  onClick?: BivariantHandler<MouseEvent> | null;
  onDblClick?: BivariantHandler<MouseEvent> | null;
  onFocus?: BivariantHandler<FocusEvent> | null;
  onInput?: BivariantHandler<InputEvent> | null;
  onKeyDown?: BivariantHandler<KeyboardEvent> | null;
  onKeyUp?: BivariantHandler<KeyboardEvent> | null;
  onMouseDown?: BivariantHandler<MouseEvent> | null;
  onMouseEnter?: BivariantHandler<MouseEvent> | null;
  onMouseLeave?: BivariantHandler<MouseEvent> | null;
  onMouseMove?: BivariantHandler<MouseEvent> | null;
  onMouseOut?: BivariantHandler<MouseEvent> | null;
  onMouseOver?: BivariantHandler<MouseEvent> | null;
  onMouseUp?: BivariantHandler<MouseEvent> | null;
  onPointerDown?: BivariantHandler<PointerEvent> | null;
  onPointerDownCapture?: BivariantHandler<PointerEvent> | null;
  onPointerEnter?: BivariantHandler<PointerEvent> | null;
  onPointerLeave?: BivariantHandler<PointerEvent> | null;
  onPointerMove?: BivariantHandler<PointerEvent> | null;
  onPointerUp?: BivariantHandler<PointerEvent> | null;
  onScroll?: BivariantHandler<Event> | null;
  onSubmit?: BivariantHandler<SubmitEvent> | null;
  onTouchEnd?: BivariantHandler<TouchEvent> | null;
  onTouchStart?: BivariantHandler<TouchEvent> | null;
  onWheel?: BivariantHandler<WheelEvent> | null;
}
/**
 * Props understood specially by intrinsic JSX elements.
 *
 * This stays separate from Props so component-level prop bags can remain
 * intentionally generic while JSX element usage gets stronger contracts.
 */
interface IntrinsicProps extends IntrinsicEventProps {
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
  contentEditable?: ReactiveProp<IntrinsicEnumeratedValue>;
  draggable?: ReactiveProp<IntrinsicEnumeratedValue>;
  enterKeyHint?: ReactiveProp<IntrinsicTextValue>;
  inputMode?: ReactiveProp<IntrinsicTextValue>;
  spellCheck?: ReactiveProp<IntrinsicEnumeratedValue>;
  writingSuggestions?: ReactiveProp<IntrinsicEnumeratedValue>;
  [attr: `aria-${string}`]: ReactiveProp<IntrinsicAriaValue>;
  [attr: `data-${string}`]: ReactiveProp<IntrinsicDataValue>;
  /**
   * Assigns the DOM property after the prefix, verbatim (`prop:srcObject`).
   * Never written as an attribute, and never rendered by SSR.
   */
  [prop: `prop:${string}`]: unknown;
  /**
   * Writes the attribute after the prefix as named, where Askr would otherwise
   * set a property (`attr:config` on a custom element).
   */
  [attr: `attr:${string}`]: ReactiveProp<IntrinsicDataValue>;
}
/**
 * Fallback intrinsic props for arbitrary tag names and dynamic prop spreads.
 *
 * This keeps the generic runtime-friendly `Props` bag available where the
 * renderer intentionally accepts unknown attributes, while known high-use
 * elements can be declared more precisely in JSX.IntrinsicElements.
 */
type IntrinsicFallbackProps = IntrinsicProps & Props;
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
  maxLength?: never;
  maxlength?: never;
  minLength?: never;
  minlength?: never;
  multiple?: never;
  name?: never;
  noValidate?: never;
  placeholder?: never;
  readOnly?: never;
  readonly?: never;
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
type LayoutIntrinsicProps = StructuredContentIntrinsicProps;
type OrderedListIntrinsicProps = StructuredContentIntrinsicProps<{
  reversed?: ReactiveProp<IntrinsicBooleanValue>;
  start?: ReactiveProp<IntrinsicNumberValue>;
  type?: ReactiveProp<IntrinsicTextValue>;
}>;
type ListItemIntrinsicProps = StructuredContentIntrinsicProps<{
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
type TableCellIntrinsicProps =
  StructuredContentIntrinsicProps<TableCellIntrinsicAllowedProps>;
type TableHeaderIntrinsicProps = StructuredContentIntrinsicProps<
  TableCellIntrinsicAllowedProps & {
    abbr?: ReactiveProp<IntrinsicTextValue>;
    scope?: ReactiveProp<TableHeaderScopeValue>;
  }
>;
interface AnchorIntrinsicProps extends IntrinsicProps {
  href?: ReactiveProp<IntrinsicTextValue>;
  rel?: ReactiveProp<IntrinsicTextValue>;
  target?: ReactiveProp<IntrinsicTextValue>;
}
interface ButtonIntrinsicProps extends IntrinsicProps {
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  type?: ReactiveProp<IntrinsicTextValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}
interface FormIntrinsicProps extends IntrinsicProps {
  action?: ReactiveProp<IntrinsicTextValue>;
  autoComplete?: ReactiveProp<IntrinsicTextValue>;
  autocomplete?: ReactiveProp<IntrinsicTextValue>;
  method?: ReactiveProp<IntrinsicTextValue>;
  noValidate?: ReactiveProp<IntrinsicBooleanValue>;
}
interface ImageIntrinsicProps extends IntrinsicProps {
  alt?: ReactiveProp<IntrinsicTextValue>;
  height?: ReactiveProp<IntrinsicTextLikeValue>;
  src?: ReactiveProp<IntrinsicTextValue>;
  width?: ReactiveProp<IntrinsicTextLikeValue>;
}
interface InputIntrinsicProps extends IntrinsicProps {
  autoComplete?: ReactiveProp<IntrinsicTextValue>;
  autocomplete?: ReactiveProp<IntrinsicTextValue>;
  checked?: ReactiveProp<IntrinsicBooleanValue>;
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  /** Sets the `indeterminate` property; there is no attribute to render. */
  indeterminate?: ReactiveProp<IntrinsicBooleanValue>;
  maxLength?: ReactiveProp<IntrinsicNumberValue>;
  maxlength?: ReactiveProp<IntrinsicNumberValue>;
  minLength?: ReactiveProp<IntrinsicNumberValue>;
  minlength?: ReactiveProp<IntrinsicNumberValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  placeholder?: ReactiveProp<IntrinsicTextValue>;
  readOnly?: ReactiveProp<IntrinsicBooleanValue>;
  readonly?: ReactiveProp<IntrinsicBooleanValue>;
  required?: ReactiveProp<IntrinsicBooleanValue>;
  type?: ReactiveProp<IntrinsicTextValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}
interface LabelIntrinsicProps extends IntrinsicProps {
  htmlFor?: ReactiveProp<IntrinsicTextValue>;
}
type OutputIntrinsicProps = StructuredContentIntrinsicProps<{
  form?: ReactiveProp<IntrinsicTextValue>;
  htmlFor?: ReactiveProp<IntrinsicTextValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
}>;
type SvgPresentationIntrinsicAllowedProps = {
  alignmentBaseline?: ReactiveProp<IntrinsicTextLikeValue>;
  baselineShift?: ReactiveProp<IntrinsicTextLikeValue>;
  clipPath?: ReactiveProp<IntrinsicTextLikeValue>;
  clipRule?: ReactiveProp<IntrinsicTextValue>;
  colorInterpolation?: ReactiveProp<IntrinsicTextLikeValue>;
  colorInterpolationFilters?: ReactiveProp<IntrinsicTextLikeValue>;
  colorRendering?: ReactiveProp<IntrinsicTextLikeValue>;
  dominantBaseline?: ReactiveProp<IntrinsicTextLikeValue>;
  fill?: ReactiveProp<IntrinsicTextValue>;
  fillOpacity?: ReactiveProp<IntrinsicTextLikeValue>;
  fillRule?: ReactiveProp<IntrinsicTextValue>;
  floodColor?: ReactiveProp<IntrinsicTextLikeValue>;
  floodOpacity?: ReactiveProp<IntrinsicTextLikeValue>;
  fontFamily?: ReactiveProp<IntrinsicTextLikeValue>;
  fontSize?: ReactiveProp<IntrinsicTextLikeValue>;
  fontSizeAdjust?: ReactiveProp<IntrinsicTextLikeValue>;
  fontStretch?: ReactiveProp<IntrinsicTextLikeValue>;
  fontStyle?: ReactiveProp<IntrinsicTextLikeValue>;
  fontVariant?: ReactiveProp<IntrinsicTextLikeValue>;
  fontWeight?: ReactiveProp<IntrinsicTextLikeValue>;
  imageRendering?: ReactiveProp<IntrinsicTextLikeValue>;
  letterSpacing?: ReactiveProp<IntrinsicTextLikeValue>;
  lightingColor?: ReactiveProp<IntrinsicTextLikeValue>;
  markerEnd?: ReactiveProp<IntrinsicTextLikeValue>;
  markerMid?: ReactiveProp<IntrinsicTextLikeValue>;
  markerStart?: ReactiveProp<IntrinsicTextLikeValue>;
  maskType?: ReactiveProp<IntrinsicTextLikeValue>;
  paintOrder?: ReactiveProp<IntrinsicTextLikeValue>;
  pointerEvents?: ReactiveProp<IntrinsicTextLikeValue>;
  shapeRendering?: ReactiveProp<IntrinsicTextLikeValue>;
  stopColor?: ReactiveProp<IntrinsicTextLikeValue>;
  stopOpacity?: ReactiveProp<IntrinsicTextLikeValue>;
  stroke?: ReactiveProp<IntrinsicTextValue>;
  strokeDasharray?: ReactiveProp<IntrinsicTextLikeValue>;
  strokeDashoffset?: ReactiveProp<IntrinsicTextLikeValue>;
  strokeLinecap?: ReactiveProp<IntrinsicTextValue>;
  strokeLinejoin?: ReactiveProp<IntrinsicTextValue>;
  strokeMiterlimit?: ReactiveProp<IntrinsicTextLikeValue>;
  strokeOpacity?: ReactiveProp<IntrinsicTextLikeValue>;
  strokeWidth?: ReactiveProp<IntrinsicTextLikeValue>;
  textAnchor?: ReactiveProp<IntrinsicTextLikeValue>;
  textDecoration?: ReactiveProp<IntrinsicTextLikeValue>;
  textOverflow?: ReactiveProp<IntrinsicTextLikeValue>;
  textRendering?: ReactiveProp<IntrinsicTextLikeValue>;
  transformOrigin?: ReactiveProp<IntrinsicTextLikeValue>;
  unicodeBidi?: ReactiveProp<IntrinsicTextLikeValue>;
  vectorEffect?: ReactiveProp<IntrinsicTextLikeValue>;
  whiteSpace?: ReactiveProp<IntrinsicTextLikeValue>;
  wordSpacing?: ReactiveProp<IntrinsicTextLikeValue>;
  writingMode?: ReactiveProp<IntrinsicTextLikeValue>;
};
type SvgIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    height?: ReactiveProp<IntrinsicTextLikeValue>;
    viewBox?: ReactiveProp<IntrinsicTextValue>;
    width?: ReactiveProp<IntrinsicTextLikeValue>;
    xmlns?: ReactiveProp<IntrinsicTextValue>;
  }
>;
type SvgCircleIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    cx?: ReactiveProp<IntrinsicTextLikeValue>;
    cy?: ReactiveProp<IntrinsicTextLikeValue>;
    r?: ReactiveProp<IntrinsicTextLikeValue>;
  }
>;
type SvgGroupIntrinsicProps =
  StructuredContentIntrinsicProps<SvgPresentationIntrinsicAllowedProps>;
type SvgPathIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    d?: ReactiveProp<IntrinsicTextValue>;
  }
>;
type SvgRectIntrinsicProps = StructuredContentIntrinsicProps<
  SvgPresentationIntrinsicAllowedProps & {
    height?: ReactiveProp<IntrinsicTextLikeValue>;
    rx?: ReactiveProp<IntrinsicTextLikeValue>;
    ry?: ReactiveProp<IntrinsicTextLikeValue>;
    width?: ReactiveProp<IntrinsicTextLikeValue>;
    x?: ReactiveProp<IntrinsicTextLikeValue>;
    y?: ReactiveProp<IntrinsicTextLikeValue>;
  }
>;
interface OptionIntrinsicProps extends IntrinsicProps {
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  label?: ReactiveProp<IntrinsicTextValue>;
  selected?: ReactiveProp<IntrinsicBooleanValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}
interface SelectIntrinsicProps extends IntrinsicProps {
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  multiple?: ReactiveProp<IntrinsicBooleanValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  required?: ReactiveProp<IntrinsicBooleanValue>;
  value?: ReactiveProp<IntrinsicFormValue>;
}
interface TextareaIntrinsicProps extends IntrinsicProps {
  autoComplete?: ReactiveProp<IntrinsicTextValue>;
  autocomplete?: ReactiveProp<IntrinsicTextValue>;
  cols?: ReactiveProp<IntrinsicNumberValue>;
  disabled?: ReactiveProp<IntrinsicBooleanValue>;
  maxLength?: ReactiveProp<IntrinsicNumberValue>;
  maxlength?: ReactiveProp<IntrinsicNumberValue>;
  minLength?: ReactiveProp<IntrinsicNumberValue>;
  minlength?: ReactiveProp<IntrinsicNumberValue>;
  name?: ReactiveProp<IntrinsicTextValue>;
  placeholder?: ReactiveProp<IntrinsicTextValue>;
  readOnly?: ReactiveProp<IntrinsicBooleanValue>;
  readonly?: ReactiveProp<IntrinsicBooleanValue>;
  required?: ReactiveProp<IntrinsicBooleanValue>;
  rows?: ReactiveProp<IntrinsicNumberValue>;
  value?: ReactiveProp<IntrinsicTextValue>;
}
interface KnownIntrinsicElementProps {
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
/** The element type marker for JSX fragments (`<>...</>`), groups children without a wrapper element. */
declare const Fragment: unique symbol;
/** A component function accepting `TProps`, usable as a JSX element's `type`. */
type JSXComponent<TProps extends object = Props> = {
  bivarianceHack(props: TProps): unknown;
}['bivarianceHack'];
/** Valid `type` values for a JSX element: a tag name, a component, or a symbol (e.g. `Fragment`). */
type JSXElementType = string | JSXComponent | symbol;
/** The vnode shape produced by JSX/`jsx()` calls. */
interface JSXElement {
  /** Internal element marker */
  $$typeof: symbol;
  /** Element type: string, component, Fragment, etc */
  type: JSXElementType;
  /** Props bag */
  props: Props;
  /** Optional key (normalized by runtime) */
  key?: string | number | null;
}
declare global {
  namespace JSX {
    interface Element extends JSXElement {
      readonly __askrJsxElementBrand?: never;
    }
    interface IntrinsicElements extends KnownIntrinsicElementProps {}
    interface ElementAttributesProperty {
      props: Props;
    }
    interface ElementChildrenAttribute {
      children: unknown;
    }
  }
}
export {
  IntrinsicFallbackProps,
  JSXElementType,
  JSXComponent,
  KnownIntrinsicElementProps,
  JSXElement,
  Props,
  Fragment,
};
