import { jsx } from '@askrjs/askr/jsx-runtime';
import { IconBase } from '@askrjs/askr-ui';
import type { IconNode, IconProps } from './types';

export function createIcon(displayName: string, iconNode: IconNode) {
  function Icon({ ...rest }: IconProps) {
    return IconBase({
      ...rest,
      iconName: displayName,
      children: iconNode.map(([tag, attrs], i) =>
        jsx(tag, attrs as Record<string, unknown>, i),
      ),
    });
  }

  Icon.displayName = displayName;
  return Icon;
}
