import { resource } from '@askrjs/askr/resources';

export function fetchUser(id: number) {
  return resource(
    async ({ signal }: { signal: AbortSignal }) => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (signal.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }
      return { id, name: `User ${id}`, email: `user${id}@example.com` };
    },
    [id]
  );
}
