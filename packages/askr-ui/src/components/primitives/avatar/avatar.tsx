import { state } from '@askrjs/askr';
import {
  Presence,
  Slot,
  composeRefs,
  mergeProps,
} from '@askrjs/askr/foundations';
import { resolveCompoundId } from '../../_internal/id';
import { collectJsxElements, mapJsxTree } from '../../_internal/jsx';
import type {
  AvatarAsChildProps,
  AvatarFallbackAsChildProps,
  AvatarFallbackProps,
  AvatarImageProps,
  AvatarLoadingStatus,
  AvatarProps,
} from './avatar.types';

type AvatarEntry = {
  src: string | null;
  status: AvatarLoadingStatus;
};

type InjectedAvatarProps = {
  __avatarId?: string;
  __status?: AvatarLoadingStatus;
  __setStatus?: (status: AvatarLoadingStatus) => void;
};

const avatarEntries = new Map<string, AvatarEntry>();

function getAvatarEntry(avatarId: string) {
  const existing = avatarEntries.get(avatarId);

  if (existing) {
    return existing;
  }

  const created: AvatarEntry = {
    src: null,
    status: 'idle',
  };
  avatarEntries.set(avatarId, created);
  return created;
}

function readInjectedAvatarProps(
  props: InjectedAvatarProps
): Required<InjectedAvatarProps> {
  if (!props.__avatarId || !props.__status || !props.__setStatus) {
    throw new Error('Avatar components must be used within <Avatar>');
  }

  return {
    __avatarId: props.__avatarId,
    __status: props.__status,
    __setStatus: props.__setStatus,
  };
}

export function Avatar(props: AvatarProps): JSX.Element;
export function Avatar(props: AvatarAsChildProps): JSX.Element;
export function Avatar(props: AvatarProps | AvatarAsChildProps) {
  const { asChild, children, id, ref, ...rest } = props;
  const avatarId = resolveCompoundId('avatar', id, children);
  const entry = getAvatarEntry(avatarId);
  const statusVersion = state(0);
  const imageSource =
    collectJsxElements(children, (element) => element.type === AvatarImage)[0]
      ?.props?.src ?? null;

  statusVersion();

  if (entry.src !== imageSource) {
    entry.src =
      typeof imageSource === 'string' && imageSource ? imageSource : null;
    entry.status = entry.src ? 'loading' : 'error';
  }

  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type !== AvatarImage && element.type !== AvatarFallback) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        __avatarId: avatarId,
        __status: entry.status,
        __setStatus: (status: AvatarLoadingStatus) => {
          if (entry.status === status) {
            return;
          }

          entry.status = status;
          statusVersion.set(statusVersion() + 1);
        },
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'avatar',
    'data-avatar': 'true',
    'data-state': entry.status,
  });

  if (asChild) {
    return (
      <Slot
        asChild
        {...finalProps}
        children={enhancedChildren as JSX.Element}
      />
    );
  }

  return <span {...finalProps}>{enhancedChildren}</span>;
}

export function AvatarImage(
  props: AvatarImageProps & InjectedAvatarProps
): JSX.Element {
  const {
    alt,
    onLoadingStatusChange,
    ref,
    src,
    __avatarId,
    __status,
    __setStatus,
    ...rest
  } = props;
  const injected = readInjectedAvatarProps({
    __avatarId,
    __status,
    __setStatus,
  });

  const setStatus = (status: AvatarLoadingStatus) => {
    injected.__setStatus(status);
    onLoadingStatusChange?.(status);
  };

  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLImageElement | null) => void)
        | { current: HTMLImageElement | null }
        | null
        | undefined,
      () => {
        if (!src) {
          setStatus('error');
        }
      }
    ),
    alt,
    src,
    hidden: injected.__status !== 'loaded' ? true : undefined,
    'data-slot': 'avatar-image',
    'data-avatar-image': 'true',
    'data-state': injected.__status,
    onLoad: () => {
      setStatus('loaded');
    },
    onError: () => {
      setStatus('error');
    },
  });

  return <img {...finalProps} />;
}

export function AvatarFallback(props: AvatarFallbackProps): JSX.Element | null;
export function AvatarFallback(
  props: AvatarFallbackAsChildProps
): JSX.Element | null;
export function AvatarFallback(
  props:
    | (AvatarFallbackProps & InjectedAvatarProps)
    | (AvatarFallbackAsChildProps & InjectedAvatarProps)
) {
  const { asChild, children, ref, __avatarId, __status, __setStatus, ...rest } =
    props;
  const injected = readInjectedAvatarProps({
    __avatarId,
    __status,
    __setStatus,
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'avatar-fallback',
    'data-avatar-fallback': 'true',
    'data-state': injected.__status,
  });

  return (
    <Presence present={injected.__status !== 'loaded'}>
      {asChild ? (
        <Slot asChild {...finalProps} children={children} />
      ) : (
        <span {...finalProps}>{children}</span>
      )}
    </Presence>
  );
}
