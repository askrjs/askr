import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import type { SSRData } from './context';

export function serializeHydrationRenderData(
  data: SSRData | undefined
): string {
  if (!data || Object.keys(data).length === 0) {
    return '';
  }

  return `<script type="application/json" ${SSR_RENDER_DATA_ATTR}="true">${JSON.stringify(
    data
  )
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
}
