/**
 * A minimal structural interface that matches both 
 * better-sqlite3 and node:sqlite (DatabaseSync) engines.
 * @public
 */
export interface GenericSqliteClient {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
  exec(sql: string): void;
}

/**
 * Defines the allowed comparison operators for constructing WHERE conditions in SQL queries. This type includes standard comparison operators such as '=', '>', '<', '>=', '<=', '!=', as well as 'LIKE' for pattern matching, 'IN' for checking against a list of values, and 'IS'/'IS NOT' for null checks. These operators are used in the query builder methods to specify how columns should be compared to values when filtering results or performing mutations.
 * @public
 */
export type ComparisonOperator = '=' | '>' | '<' | '>=' | '<=' | '!=' | 'LIKE' | 'IN' | 'IS' | 'IS NOT';