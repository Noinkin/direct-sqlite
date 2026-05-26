import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { Database } from './index.js';
import { table, text, integer, real, blob, boolean } from '@name/schema';

// 1. Definition Setup for the main test tracking structures
const inventoryTable = table('inventory', {
  id: integer().primaryKey().autoIncrement(),
  sku: text().notNull(),
  price: real().notNull(),
  rawData: blob(),
  isAvailable: boolean().notNull() // Infers type: 1 | 0
});

const usersTable = table('users', {
  id: integer().primaryKey(),
  name: text().notNull(),
  rank: integer()
});

describe('⚡ direct-sqlite Core Wrapper Test Suite', () => {
  let db: Database;

  beforeEach(() => {
    // Fresh in-memory sandbox connection initialization before each test run
    db = new Database(new DatabaseSync(':memory:'));
  });

  // --- MATRIX A: COMPLEX STORAGE TYPES ---
  describe('Full SQLite Type Capabilities Matrix', () => {
    it('should accept and compile all complex sqlite primitives cleanly', () => {
      const inventory = db.createTable(inventoryTable);
      const mockBuffer = Buffer.from('binary-file-payload');

      // 1. Write validation
      inventory.insert({
        sku: 'PROD-A100',
        price: 99.99,
        rawData: mockBuffer,
        isAvailable: 1
      });

      // 2. Read evaluation
      const item = inventory.select().where('sku', '=', 'PROD-A100').get();

      expect(item).toBeDefined();
      expect(item?.sku).toBe('PROD-A100');
      expect(item?.price).toBe(99.99);
      expect(item?.isAvailable).toBe(1);
      expect(item?.rawData instanceof Uint8Array).toBe(true);
    });

    it('should handle nullable optional values gracefully', () => {
      const inventory = db.createTable(inventoryTable);

      inventory.insert({
        sku: 'PROD-NULL',
        price: 0.00,
        rawData: null, // Optional BLOB target field representation
        isAvailable: 0
      });

      const item = inventory.select().where('sku', '=', 'PROD-NULL').get();
      expect(item?.rawData).toBeNull();
    });
  });

  // --- MATRIX B: FLUENT CRUD ACTIONS ---
  describe('Isolated Fluent CRUD Execution Engine', () => {
    it('should manage full structured lifecycles type-safely', () => {
      const users = db.createTable(usersTable);

      // 1. Bulk Insertion Operations
      users.insert({ id: 1, name: 'Alice', rank: 10 });
      users.insert({ id: 2, name: 'Bob', rank: 20 });
      users.insert({ id: 3, name: 'Charlie', rank: 30 });

      // 2. Selection Query Filtering & Conditions Verification
      const filteredResult = users.select().where('rank', '>', 15).all();
      expect(filteredResult.length).toBe(2);
      expect(filteredResult.some(u => u.name === 'Bob')).toBe(true);

      // 3. Conditional Target Mutation Updates
      const updateResult = users.update({ name: 'Alice Smith' }).where('id', '=', 1).execute();
      expect(updateResult.changes).toBe(1);

      const updatedRecord = users.select().where('id', '=', 1).get();
      expect(updatedRecord?.name).toBe('Alice Smith');

      // 4. Chains, Bound Ordering, and Limits Verification
      const orderedList = users.select().orderBy('id', 'DESC').limit(2).all();
      expect(orderedList.length).toBe(2);
      expect(orderedList[0]?.id).toBe(3); // Charlie
      expect(orderedList[1]?.id).toBe(2); // Bob

      // 5. Targeted Removals & Deletion Verification
      const deleteResult = users.delete().where('id', '=', 2).execute();
      expect(deleteResult.changes).toBe(1);

      const verifiedRemainingList = users.select().all();
      expect(verifiedRemainingList.length).toBe(2);
      expect(verifiedRemainingList.find(u => u.id === 2)).toBeUndefined();
    });

    it('should allow unconditioned updates and deletions table-wide', () => {
      const users = db.createTable(usersTable);
      users.insert({ id: 1, name: 'User A', rank: 1 });
      users.insert({ id: 2, name: 'User B', rank: 2 });

      // Global update modification across all active elements
      users.update({ rank: 99 }).execute();
      
      const checkAll = users.select().all();
      expect(checkAll.every(u => u.rank === 99)).toBe(true);

      // Global cleanup truncation removal sequence
      users.delete().execute();
      expect(users.select().all().length).toBe(0);
    });
  });

  // --- MATRIX C: PERFORMANCE COMPILER GUARDRAILS ---
  describe('Statement Optimizer and Cache Operations', () => {
    it('should successfully match statements against internal caching layers', () => {
      const users = db.createTable(usersTable);
      
      // Execute repetitive calls to verify internal map storage hits
      users.insert({ id: 1, name: 'Test Execution 1', rank: 1 });
      users.insert({ id: 2, name: 'Test Execution 2', rank: 2 });

      const runOne = users.select().where('id', '=', 1).get();
      const runTwo = users.select().where('id', '=', 2).get(); // Cache Hit

      expect(runOne?.name).toBe('Test Execution 1');
      expect(runTwo?.name).toBe('Test Execution 2');
    });
  });

  // --- MATRIX D: SECURITY INTEGRITY EXCEPTIONS ---
  describe('STRICT Mode Core Constraints validation', () => {
    it('should prevent inserting mismatching dynamic properties down columns', () => {
      const inventory = db.createTable(inventoryTable);

      expect(() => {
        inventory.insert({
          sku: 'CRASH-PROD',
          // Malformed runtime input type mismatch violating engine rules
          price: 'A hundred dollars' as any, 
          isAvailable: 1
        });
      }).toThrow(); // Should abort transaction instantly via STRICT mode
    });

    it('should block operations violating NOT NULL conditions', () => {
      const inventory = db.createTable(inventoryTable);

      expect(() => {
        inventory.insert({
          sku: null as any, // Violation of NOT NULL constraints
          price: 19.99,
          isAvailable: 1
        });
      }).toThrow();
    });
  });
});