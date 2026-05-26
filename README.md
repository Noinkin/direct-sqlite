# Direct SQLite

High-performance, type-safe SQLite database operations for modern architectures.

`direct-sqlite` is a minimalist, zero-allocation database binding layer. It removes the heavy intermediate ORM parsing layers found in traditional tools, allowing you to execute queries with near-zero runtime abstraction overhead while maintaining full TypeScript compile-time validation.

## Core Features

- 🚀 **Zero Overhead:** Direct bindings to native SQLite drivers without unnecessary serialization/deserialization.
- 🛡️ **Compile-Time Safe:** Full schema-driven type inference for builders and results.
- 🛠️ **Runtime Agnostic:** Works seamlessly with `better-sqlite3`, `node:sqlite`, and other native handlers.
- 🏗️ **Fluent API:** Intuitive, chainable builders for complex queries and mutations.

## Installation

```bash
pnpm add direct-sqlite
```

## Quick Start

1. **Define Schema**
   ```typescript
   import { table, text, integer } from '@direct-sqlite/schema';

   export const users = table('users', {
     id: integer('id').primaryKey(),
     name: text('name').notNull(),
   });
   ```

2. **Initialize**
   ```typescript
   import { Database } from '@direct-sqlite/core';
   import { DatabaseSync } from 'node:sqlite';
   import * as schema from './schema';

   const db = new Database(new DatabaseSync('app.db'), { schema });
   ```

3. **Query**
   ```typescript
   const allUsers = await db.select().from(users).execute();
   ```

## Documentation

Comprehensive guides, API references, and configuration details are available on our [documentation site](https://noinkin.github.io/direct-sqlite/).

## Contributing

Contributions are welcome! Please check our [contributing guidelines](CONTRIBUTING.md) before submitting a PR.

## License

MIT © [Your Name/Organization]