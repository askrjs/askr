declare global {
  var __BULK_RENDER_COUNT: number | undefined;

  // Namespaced diagnostics and test hooks.
  // Keep this permissive: tests may stash extra keys.
  var __ASKR__:
    | {
        __PORTAL_WRITES?: number;
        __PORTAL_READS?: number;
        __PORTAL_HOST_ATTACHED?: boolean;
        __PORTAL_HOST_ID?: string;

        __FASTLANE?: {
          isBulkCommitActive?: () => boolean;
        };

        [key: string]: unknown;
      }
    | undefined;

  interface GlobalThis {
    createPortalSlot?: unknown;
  }
}

export {};
