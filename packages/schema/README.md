# @direct-sqlite/schema

Type-safe schema composition and column validation engines for `direct-sqlite`.

## Installation

```bash
pnpm add @direct-sqlite/schema
```

## Quick Start

Define your database structures using composable table schema utilities with full type assurance:

```typescript
import { table, text, integer } from '@direct-sqlite/schema';

export const users = table('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
});
```

---

## Documentation

For deep dives into available column types, indexes, and schema definitions, check out the documentation:
👉 [direct-sqlite Documentation](https://noinkin.github.io/direct-sqlite)