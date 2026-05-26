---
title: Queries and Mutations
description: Fluent building blocks for reading, transforming, and persisting dataset rows.
---

`direct-sqlite` uses a zero-allocation pipeline mapping strategy. Your builder configurations compile directly down to structured raw SQL strings passed straight into the underlying native engine without hidden internal array conversions.

## Executing Selection Blocks

Use the fluent `.select()` chain layout to pick specific properties or resolve full matching objects from your tables:

```typescript
import { db } from '../db';
import { users } from '../db/schema';
import { eq, gt, and } from '@direct-sqlite/expressions';

// Capture an explicit partial slice from matched rows
const results = await db
  .select({
    userId: users.id,
    userEmail: users.email
  })
  .from(users)
  .where(
    and(
      eq(users.name, 'Name'),
      gt(users.id, 100)
    )
  )
  .execute();
```

## Data Mutations

Mutations use specialized builders (`MutationBuilder`) loaded through operational engine hooks like `.insert()`, `.update()`, or `.delete()`.

### Insertion Mutations

```typescript
import { db } from '../db';
import { users } from '../db/schema';

const newUser = await db
  .insert(users)
  .values({
    name: 'Name Developer',
    email: 'name@example.com'
  })
  .returning() // Direct SQLite handles RETURNING syntax natively
  .execute();
```

### Updates with Conditional Filters

```typescript
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from '@direct-sqlite/expressions';

await db
  .update(users)
  .set({ name: 'Name N. Developer' })
  .where(eq(users.email, 'name@example.com'))
  .execute();
```

## Prepared Execution Statements

If a query or mutation pattern fires repeatedly inside a hot lookup route, compile it once on launch using `.prepare()` to skip abstract syntax tree (AST) parsing entirely on sequential lookups:

```typescript
import { placeholder } from '@direct-sqlite/expressions';

// Pre-compile the execution plan down once on startup
const userLookup = db
  .select()
  .from(users)
  .where(eq(users.id, placeholder('id')))
  .prepare();

// Supercharge loops by calling the fast execution handle directly 
const user1 = userLookup.all({ id: 1 });
const user2 = userLookup.all({ id: 2 });
```