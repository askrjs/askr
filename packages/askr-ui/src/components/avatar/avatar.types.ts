import type { Ref } from '@askrjs/askr/foundations';
import type { BoxAsChildProps, BoxProps } from '../_internal/types';

export type AvatarLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type AvatarOwnProps = {
  children?: unknown;
  id?: string;
};

export type AvatarProps = BoxProps<'span', HTMLSpanElement> & AvatarOwnProps;
export type AvatarAsChildProps = BoxAsChildProps & AvatarOwnProps;

export type AvatarImageOwnProps = {
  src?: string;
  alt: string;
  onLoadingStatusChange?: (status: AvatarLoadingStatus) => void;
};

export type AvatarImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'children' | 'ref' | 'onLoad' | 'onError' | 'alt' | 'src'
> &
  AvatarImageOwnProps & {
    ref?: Ref<HTMLImageElement>;
  };

export type AvatarFallbackOwnProps = {
  children?: unknown;
};

export type AvatarFallbackProps = BoxProps<'span', HTMLSpanElement> &
  AvatarFallbackOwnProps;
export type AvatarFallbackAsChildProps = BoxAsChildProps &
  AvatarFallbackOwnProps;
