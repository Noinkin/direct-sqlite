# @direct-sqlite/core

High-performance, zero-allocation database binding layer optimized for modern JavaScript runtimes. Execute queries with near-zero runtime abstraction overhead.

## Installation

```bash
pnpm add @direct-sqlite/core
```

## Quick Start

Pass a native runtime SQLite database handle directly into the core wrapper instance:

```typescript
import { Database } from '@direct-sqlite/core';
import { DatabaseSync } from 'node:sqlite';
import * as schema from './schema';

const nativeDb = new DatabaseSync('local.db');
export const db = new Database(nativeDb, { schema });
```

---

## Documentation

For full guides, configuration settings, and complete API references, visit our documentation site:
👉 [direct-sqlite Documentation](https://noinkin.github.io/direct-sqlite)