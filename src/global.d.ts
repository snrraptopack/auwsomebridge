// Runtime exports used by automatic JSX
export declare const Fragment: any;
export declare function jsx(type: any, props?: any, key?: any): any;
export declare const jsxs: typeof jsx;

import type { Ref } from 'auwla';

type Reactive<T> = T | Ref<T>;
type DataAttr = `data-${string}`;
type AriaAttr = `aria-${string}`;

type Child = string | number | Node | Reactive<string | number | Node>;
type Children = Child | Child[];

interface EventProps {
  onClick?: (e: MouseEvent) => void;
  onDblclick?: (e: MouseEvent) => void;
  onMouseenter?: (e: MouseEvent) => void;
  onMouseleave?: (e: MouseEvent) => void;
  onMousemove?: (e: MouseEvent) => void;
  onMousedown?: (e: MouseEvent) => void;
  onMouseup?: (e: MouseEvent) => void;
  onKeydown?: (e: KeyboardEvent) => void;
  onKeyup?: (e: KeyboardEvent) => void;
  onKeypress?: (e: KeyboardEvent) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  onInput?: (e: InputEvent) => void;
  onChange?: (e: Event) => void;
  onSubmit?: (e: SubmitEvent) => void;
  onPointerdown?: (e: PointerEvent) => void;
  onPointerup?: (e: PointerEvent) => void;
  onPointermove?: (e: PointerEvent) => void;
  onPointerenter?: (e: PointerEvent) => void;
  onPointerleave?: (e: PointerEvent) => void;
  onTouchstart?: (e: TouchEvent) => void;
  onTouchend?: (e: TouchEvent) => void;
  onTouchmove?: (e: TouchEvent) => void;
  onTouchcancel?: (e: TouchEvent) => void;
}

type BaseProps<E extends HTMLElement> = EventProps & {
  children?: Children;
  key?: string | number;
  ref?: (el: E) => void;
  class?: Reactive<string>;
  className?: Reactive<string>;
  id?: Reactive<string>;
  title?: Reactive<string>;
  hidden?: Reactive<boolean>;
  style?: Reactive<string | Partial<CSSStyleDeclaration>>;
  tabIndex?: Reactive<number>;
  draggable?: Reactive<boolean>;
  contentEditable?: Reactive<boolean>;
  role?: Reactive<string>;
} & { [K in DataAttr]?: Reactive<string | number | boolean> } & { [K in AriaAttr]?: Reactive<string | number | boolean> };

interface AnchorProps extends BaseProps<HTMLAnchorElement> {
  href?: Reactive<string>;
  target?: Reactive<string>;
  rel?: Reactive<string>;
}

interface ButtonProps extends BaseProps<HTMLButtonElement> {
  disabled?: Reactive<boolean>;
  type?: Reactive<'button' | 'submit' | 'reset'>;
  name?: Reactive<string>;
  value?: Reactive<string | number>;
}

interface InputProps extends BaseProps<HTMLInputElement> {
  type?: Reactive<string>;
  value?: Reactive<string | number>;
  checked?: Reactive<boolean>;
  placeholder?: Reactive<string>;
  disabled?: Reactive<boolean>;
  name?: Reactive<string>;
  min?: Reactive<number | string>;
  max?: Reactive<number | string>;
  step?: Reactive<number | string>;
}

interface TextareaProps extends BaseProps<HTMLTextAreaElement> {
  value?: Reactive<string>;
  placeholder?: Reactive<string>;
  disabled?: Reactive<boolean>;
  rows?: Reactive<number>;
  cols?: Reactive<number>;
  name?: Reactive<string>;
}

interface SelectProps extends BaseProps<HTMLSelectElement> {
  value?: Reactive<string | number>;
  multiple?: Reactive<boolean>;
  disabled?: Reactive<boolean>;
  name?: Reactive<string>;
}

interface OptionProps extends BaseProps<HTMLOptionElement> {
  value?: string | number;
  selected?: Reactive<boolean>;
  disabled?: Reactive<boolean>;
  label?: Reactive<string>;
}

interface ImgProps extends BaseProps<HTMLImageElement> {
  src?: Reactive<string>;
  alt?: Reactive<string>;
  width?: Reactive<number>;
  height?: Reactive<number>;
}

interface FormProps extends BaseProps<HTMLFormElement> {
  action?: Reactive<string>;
  method?: Reactive<string>;
}

// Global JSX types so consumers get intrinsic elements without React types
declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: BaseProps<HTMLDivElement>;
      span: BaseProps<HTMLSpanElement>;
      p: BaseProps<HTMLParagraphElement>;
      // Headings & text semantics
      h1: BaseProps<HTMLHeadingElement>;
      h2: BaseProps<HTMLHeadingElement>;
      h3: BaseProps<HTMLHeadingElement>;
      h4: BaseProps<HTMLHeadingElement>;
      h5: BaseProps<HTMLHeadingElement>;
      h6: BaseProps<HTMLHeadingElement>;
      pre: BaseProps<HTMLPreElement>;
      code: BaseProps<HTMLElement>;
      blockquote: BaseProps<HTMLQuoteElement>;
      small: BaseProps<HTMLElement>;
      strong: BaseProps<HTMLElement>;
      em: BaseProps<HTMLElement>;
      i: BaseProps<HTMLElement>;
      b: BaseProps<HTMLElement>;
      u: BaseProps<HTMLElement>;
      s: BaseProps<HTMLElement>;
      sup: BaseProps<HTMLElement>;
      sub: BaseProps<HTMLElement>;
      ul: BaseProps<HTMLUListElement>;
      ol: BaseProps<HTMLOListElement>;
      dl: BaseProps<HTMLDListElement>;
      dt: BaseProps<HTMLElement>;
      dd: BaseProps<HTMLElement>;
      li: BaseProps<HTMLLIElement>;
      section: BaseProps<HTMLElement>;
      article: BaseProps<HTMLElement>;
      aside: BaseProps<HTMLElement>;
      header: BaseProps<HTMLElement>;
      footer: BaseProps<HTMLElement>;
      nav: BaseProps<HTMLElement>;
      main: BaseProps<HTMLElement>;
      figure: BaseProps<HTMLElement>;
      figcaption: BaseProps<HTMLElement>;
      details: BaseProps<HTMLDetailsElement>;
      summary: BaseProps<HTMLElement>;
      dialog: BaseProps<HTMLDialogElement>;
      label: BaseProps<HTMLLabelElement>;

      a: AnchorProps;
      button: ButtonProps;
      input: InputProps;
      textarea: TextareaProps;
      select: SelectProps;
      option: OptionProps;
      form: FormProps;
      fieldset: BaseProps<HTMLFieldSetElement>;
      legend: BaseProps<HTMLLegendElement>;

      img: ImgProps;
      audio: BaseProps<HTMLAudioElement>;
      video: BaseProps<HTMLVideoElement>;
      source: BaseProps<HTMLSourceElement>;
      track: BaseProps<HTMLTrackElement>;
      canvas: BaseProps<HTMLCanvasElement>;
      iframe: BaseProps<HTMLIFrameElement>;

      table: BaseProps<HTMLTableElement>;
      thead: BaseProps<HTMLTableSectionElement>;
      tbody: BaseProps<HTMLTableSectionElement>;
      tfoot: BaseProps<HTMLTableSectionElement>;
      tr: BaseProps<HTMLTableRowElement>;
      th: BaseProps<HTMLTableCellElement>;
      td: BaseProps<HTMLTableCellElement>;
      col: BaseProps<HTMLTableColElement>;
      colgroup: BaseProps<HTMLTableColElement>;

      hr: BaseProps<HTMLHRElement>;
      br: BaseProps<HTMLBRElement>;
      address: BaseProps<HTMLElement>;
      time: BaseProps<HTMLTimeElement>;
      progress: BaseProps<HTMLProgressElement>;
      meter: BaseProps<HTMLMeterElement>;
      template: BaseProps<HTMLTemplateElement>;
    }
    // Children property name for JSX elements
    interface ElementChildrenAttribute { children: Children }
    // Shape of an element produced by Auwla JSX
    type Element = HTMLElement;
  }
}

export {};