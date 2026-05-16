import { describe, expect, it } from 'vite-plus/test';

describe('foundations resolution', () => {
  it('should resolve the slim root entrypoint and explicit subpaths', async () => {
    const foundations = (await import('@askrjs/askr/foundations')) as {
      layout: unknown;
      Slot: unknown;
      definePortal: unknown;
      DefaultPortal: unknown;
      Portal: unknown;
      Presence: unknown;
    };

    expect(typeof foundations.layout).toBe('function');
    expect(typeof foundations.Slot).toBe('function');
    expect(typeof foundations.definePortal).toBe('function');

    expect(typeof foundations.DefaultPortal).toBe('function');
    expect(
      typeof (foundations.DefaultPortal as { render?: unknown }).render
    ).toBe('function');

    expect(typeof foundations.Portal).toBe('function');
    expect(typeof foundations.Presence).toBe('function');
    expect('createCollection' in foundations).toBe(false);
    expect('createLayer' in foundations).toBe(false);
    expect('composeHandlers' in foundations).toBe(false);
    expect('pressable' in foundations).toBe(false);
    expect('isControlled' in foundations).toBe(false);
    expect('IconBase' in foundations).toBe(false);

    const utilities = (await import('@askrjs/askr/foundations/utilities')) as {
      composeHandlers: unknown;
      composeRefs: unknown;
      formatId: unknown;
      mergeProps: unknown;
    };

    expect(typeof utilities.composeHandlers).toBe('function');
    expect(typeof utilities.composeRefs).toBe('function');
    expect(typeof utilities.formatId).toBe('function');
    expect(typeof utilities.mergeProps).toBe('function');

    const interactions =
      (await import('@askrjs/askr/foundations/interactions')) as {
        applyInteractionPolicy: unknown;
        dismissable: unknown;
        pressable: unknown;
        rovingFocus: unknown;
      };

    expect(typeof interactions.applyInteractionPolicy).toBe('function');
    expect(typeof interactions.dismissable).toBe('function');
    expect(typeof interactions.pressable).toBe('function');
    expect(typeof interactions.rovingFocus).toBe('function');

    const state = (await import('@askrjs/askr/foundations/state')) as {
      controllableState: unknown;
      isControlled: unknown;
      makeControllable: unknown;
      resolveControllable: unknown;
    };

    expect(typeof state.controllableState).toBe('function');
    expect(typeof state.isControlled).toBe('function');
    expect(typeof state.makeControllable).toBe('function');
    expect(typeof state.resolveControllable).toBe('function');

    const structures =
      (await import('@askrjs/askr/foundations/structures')) as {
        Slot: unknown;
        createCollection: unknown;
        createLayer: unknown;
        definePortal: unknown;
        layout: unknown;
        Presence: unknown;
      };

    expect(typeof structures.layout).toBe('function');
    expect(typeof structures.Slot).toBe('function');
    expect(typeof structures.definePortal).toBe('function');
    expect(typeof structures.Presence).toBe('function');
    expect(typeof structures.createCollection).toBe('function');
    expect(typeof structures.createLayer).toBe('function');

    const icon = (await import('@askrjs/askr/foundations/icon')) as {
      IconBase: unknown;
      getIconContractProps: unknown;
      isIconSizeToken: unknown;
    };

    expect(typeof icon.IconBase).toBe('function');
    expect(typeof icon.getIconContractProps).toBe('function');
    expect(typeof icon.isIconSizeToken).toBe('function');
  }, 20_000);
});
