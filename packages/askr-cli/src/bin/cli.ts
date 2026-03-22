type Command = 'create' | 'ssg';

export function runCli(command: Command): never {
  if (command === 'create') {
    throw new Error('create command is not implemented yet');
  }

  throw new Error('ssg command is not implemented yet');
}
