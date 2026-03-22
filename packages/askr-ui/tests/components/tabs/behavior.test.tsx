import { afterEach, describe, expect, it } from 'vitest';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../src/components/tabs';
import { TABS_A11Y_CONTRACT } from '../../../src/components/tabs/tabs.a11y';
import { flushUpdates, mount, unmount } from '../../test-utils';

function getButtonByText(
  container: HTMLElement,
  text: string
): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Unable to find button with text "${text}"`);
  }

  return button;
}

describe('Tabs - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('should support automatic and manual activation', async () => {
    container = mount(
      <div>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview panel</TabsContent>
          <TabsContent value="settings">Settings panel</TabsContent>
        </Tabs>
        <Tabs defaultValue="overview" activationMode="manual">
          <TabsList>
            <TabsTrigger value="overview">Overview manual</TabsTrigger>
            <TabsTrigger value="settings">Settings manual</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview manual panel</TabsContent>
          <TabsContent value="settings">Settings manual panel</TabsContent>
        </Tabs>
      </div>
    );

    getButtonByText(container, 'Settings').focus();
    await flushUpdates();
    expect(
      container.querySelector(`[role="${TABS_A11Y_CONTRACT.PANEL_ROLE}"]`)
        ?.textContent
    ).toContain('Settings panel');

    getButtonByText(container, 'Settings manual').focus();
    await flushUpdates();
    expect(
      Array.from(
        container.querySelectorAll(`[role="${TABS_A11Y_CONTRACT.PANEL_ROLE}"]`)
      ).some((panel) => panel.textContent?.includes('Settings manual panel'))
    ).toBe(false);

    getButtonByText(container, 'Settings manual').click();
    await flushUpdates();
    expect(
      Array.from(
        container.querySelectorAll(`[role="${TABS_A11Y_CONTRACT.PANEL_ROLE}"]`)
      ).some((panel) => panel.textContent?.includes('Settings manual panel'))
    ).toBe(true);
  });
});
