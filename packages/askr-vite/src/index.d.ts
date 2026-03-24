import type { Plugin } from 'vite';

export interface AskrVitePluginOptions {
  transformJsx?: boolean;
  optimizeTemplates?: boolean;
  ssrPrecompile?: boolean;
}

export declare function askrVitePlugin(opts?: AskrVitePluginOptions): Plugin;

export declare const askr: typeof askrVitePlugin;

export default askrVitePlugin;
