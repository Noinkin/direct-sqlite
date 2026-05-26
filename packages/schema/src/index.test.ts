import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { table, text, integer } from './index.js';

describe('correct table creation', () => {
  const usersTable = table('users', {
    id: integer(),
    name: text(),
  });

  it('table types are correct', () => {
    expect(usersTable.$name).toBe('users');
    expect(usersTable.$columns.id.type).toBe('INTEGER');
    expect(usersTable.$columns.name.type).toBe('TEXT');
  });
});