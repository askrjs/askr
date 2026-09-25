// @askrjs/auth and @askrjs/schema are optional, type-only peers. Every
// published declaration reaches them through this module so an app that never
// installs them still typechecks with `skipLibCheck: false`; their types
// degrade to `any` until the app installs the peer it uses.
// @ts-ignore -- optional peer: resolves only when @askrjs/auth is installed.
export type { AuthContext, AuthRequirement } from '@askrjs/auth';
// @ts-ignore -- optional peer: resolves only when @askrjs/schema is installed.
export type { InferSchema, ObjectSchema } from '@askrjs/schema';
