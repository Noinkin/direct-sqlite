import { type GenericSqliteClient, type ComparisonOperator } from "./types.js";

/**
 * High-performance, zero-allocation abstraction layer for SQLite instances.
 * Normalizes differences between `better-sqlite3`, `node:sqlite` and 'bun:sqlite`.
 * @public
 */
export class Database {
    private readonly stmtCache = new Map<string, any>();
    private readonly maxCacheSize: number = 1000;

    /**
     * @param client - An instance of a SQLite client (`better-sqlite3`, `node:sqlite` or 'bun:sqlite`).
     * @param options - Optional configuration for performance tuning and statement cache size.
     * @param options.optimize - Pre-configure the database with specific PRAGMA settings for 'WAL', 'MEMORY', or 'FAST' modes.
     * @param options.cacheSize - Maximum number of prepared statements to cache before evicting the least recently used one.
     */
    constructor(public readonly client: GenericSqliteClient, private readonly options?: { optimize?: 'WAL' | 'MEMORY' | 'FAST', cacheSize?: number }) {
        if (this.options?.cacheSize !== undefined) {
            this.maxCacheSize = this.options.cacheSize;
        }
        if (this.options?.optimize) {
            this.optimize(this.options.optimize);
        }

        try {
            this.client.exec('PRAGMA foreign_keys = ON;');
            this.client.exec('PRAGMA busy_timeout = 5000;');
        } catch (error) {
            console.error('Initialization tuning pragma failed to execute:', error);
        }
    }

    /**
     * Creates a table based on the provided configuration and returns a TableRunner for that table.
     * @param tableConfig - An object containing the table name, SQL creation statement, and an inference type for the table's rows.
     * @returns A TableRunner instance for the created table.
     */
    public createTable<T extends { $name: string, $createSql: string, $infer: any }>(tableConfig: T) {
        this.client.exec(tableConfig.$createSql);
        return this.table(tableConfig);
    }

    /**
     * Initializes a TableRunner for an existing table in the database, allowing for fluent query building and execution.
     * @param tableConfig - An object containing the table name, SQL creation statement, and an inference type for the table's rows.
     * @returns A TableRunner instance for the specified table.
     */
    public table<T extends { $name: string, $infer: any }>(tableConfig: T) {
        return new TableRunner<T['$infer']>(this, this.client, tableConfig.$name);
    }

    /**
     * Executes a series of database operations within a transaction. If any operation throws an error, the transaction will be rolled back.
     * @param callback - Function containing the database operations to execute within the transaction.
     * @returns The value returned by the callback function if the transaction commits successfully.
     */
    public transaction<T>(callback: () => T): T {
        this.client.exec('BEGIN TRANSACTION;');

        try {
            const result = callback();
            this.client.exec('COMMIT;');
            return result;
        } catch (error) {
            this.client.exec('ROLLBACK;');
            throw error;
        }
    }

    /**
     * Fine tunes the database engine for high-throughput scenarios.
     * @param mode - The optimization mode to apply. 'WAL' enables Write-Ahead Logging for better concurrency, 'MEMORY' disables journaling and synchronous mode for maximum speed (but no durability), and 'FAST' disables synchronous mode and increases cache size for faster reads/writes at the cost of durability.
     */
    public optimize(mode: 'WAL' | 'MEMORY' | 'FAST' = 'WAL') {
        if(mode === 'WAL') {
            this.client.exec('PRAGMA journal_mode = WAL;');
            this.client.exec('PRAGMA synchronous = NORMAL;');
        } else if(mode === 'MEMORY') {
            this.client.exec('PRAGMA journal_mode = OFF;');
            this.client.exec('PRAGMA synchronous = OFF;');
        } else if(mode === 'FAST') {
            this.client.exec('PRAGMA synchronous = OFF;');
            this.client.exec('PRAGMA cache_size = -64000;');
        }
        return this;
    }

    /**
     * Performs a non-blocking copy of the database to target path.
     * @param destinationPath - The file path where the backup should be saved. Should be an absolute path or relative to the current working directory.
     */
    public backup(destinationPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if(typeof (this.client as any).backup === 'function') {
                (this.client as any).backup(destinationPath)
                    .then(() => resolve())
                    .catch((error: Error) => reject(error));
            } else {
                try {
                    this.client.exec(`VACUUM INTO '${destinationPath}';`);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        });
    };

    /**
     * Flushes tracked log buffers back into primary storage to shrink log file.
     */
    public checkpoint(): void {
        this.client.exec('PRAGMA wal_checkpoint(PASSIVE);');
    }

    /**
     * Binds a custom JavaScript runtime algorithm which is directly executable in SQL queries.
     * @param name - The name of the function to register.
     * @param callback - The function to be called when the SQL function is invoked.
     */
    public function(name: string, callback: (...args: any[]) => any): this {
        if (typeof (this.client as any).function === 'function') {
            (this.client as any).function(name, callback);
        } else if (typeof (this.client as any).register === 'function') {
            (this.client as any).register(callback, { name });
        }
        return this;
    }

    /**
     * Hooks up custom metric calculations that aggregate state step-by-step across matching rows.
     * @param name - The name of the aggregate function to register.
     * @param options - Aggregate function options to register.
     */
    public aggregate(name: string, options: { start: any; step: (acc: any, next: any) => any; result?: (acc: any) => any }): this {
        if (typeof (this.client as any).aggregate === 'function') {
            (this.client as any).aggregate(name, options);
        } else if (typeof (this.client as any).register === 'function') {
            (this.client as any).register({...options, name, aggregate: options.step});
        }
        return this;
    }

    /**
     * Resolves statements from cache or registers a fresh pointer with LRU cache eviction defenses active.
     * @param sql - The SQL query string for which to retrieve or create a prepared statement.
     * @returns The prepared statement.
     */
    public getStatement(sql: string) {
        let stmt = this.stmtCache.get(sql);
        if (!stmt) {
            if (this.stmtCache.size >= this.maxCacheSize) {
                const oldestKey = this.stmtCache.keys().next().value;
                if (oldestKey) {
                    const oldestStmt = this.stmtCache.get(oldestKey);
                    if (oldestStmt && typeof oldestStmt.finalize === 'function') oldestStmt.finalize();
                    this.stmtCache.delete(oldestKey);
                }
            }
            
            stmt = this.client.prepare(sql);
            this.stmtCache.set(sql, stmt);
        }
        return stmt;
    }
}

/**
 * Core table execution driver managing distinct query builder pipelines.
 * @internal
 */
export class TableRunner<TRow> {
    constructor(
        private readonly db: Database,
        private readonly client: GenericSqliteClient,
        private readonly tableName: string
    ) {};

    /**
     * Generates a targeted selection pipeline targeting specified key components. Defaults to `SELECT *`.
     * @param columns - An optional list of column names to select. If omitted, all columns will be selected.
     * @returns A SelectQueryBuilder instance for building and executing the SELECT query.
     * @public
     */
    public select<K extends keyof TRow>(...columns: K[]): SelectQueryBuilder<TRow, K> {
        return new SelectQueryBuilder<TRow, K>(this.db, this.client, this.tableName, columns);
    }

    /**
     * Spawns a query builder to update properties inside matching row footprints.
     * @param data - An object containing the columns and their new values to be updated.
     * @returns A MutationBuilder instance for building and executing the UPDATE query.
     * @public
     */
    public update(data: Partial<TRow>): MutationBuilder<TRow> {
        return new MutationBuilder<TRow>(this.db, this.client, this.tableName, 'UPDATE', data);
    }

    /**
     * Spawns a query builder to wipe matching elements from storage.
     * @returns A MutationBuilder instance for building and executing the DELETE query.
     * @public
     */
    public delete(): MutationBuilder<TRow> {
        return new MutationBuilder<TRow>(this.db, this.client, this.tableName, 'DELETE');
    }

    /**
     * Shorthand helper to quickly initialize a full row read operation matching a specific filter criteria.
     * @param column - The column name to apply the WHERE condition on. Should be a key of the table's row type.
     * @param operator - The comparison operator to use in the WHERE condition. Should be one of the defined ComparisonOperator types.
     * @param value - The value to compare against. Can be a single value, an array of values, or null.
     * @returns A SelectQueryBuilder instance for building and executing the SELECT query.
     * @public
     */
    public where<K extends keyof TRow>(column: K, operator: ComparisonOperator, value: TRow[K] | TRow[K][] | null): SelectQueryBuilder<TRow, keyof TRow> {
        return new SelectQueryBuilder<TRow, keyof TRow>(this.db, this.client, this.tableName, []).where(column, operator, value);
    }

    /**
     * Runs an atomic single-record write payload tracking metadata state alterations.
     * @param data - An object containing the columns and their values to be inserted.
     * @returns The result of the insert operation, which typically includes the number of changes made and the last inserted row ID. The exact structure of the result may depend on the underlying SQLite client being used.
     * @public
     */
    public insert(data: Partial<TRow>) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

        const res = this.db.getStatement(sql).run(...values);
        return {
            changes: res.changes,
            lastInsertRowId: Number(res.lastInsertRowid)
        }
    }

    /**
     * Packages arrays of similar records into a single multi-row insertion statement to minimize execution context switches.
     * @param records - An array of objects, each containing the columns and their values to be inserted for a single row.
     * @returns The result of the insert operation, which typically includes the number of changes made and the last inserted row ID. The exact structure of the result may depend on the underlying SQLite client being used.
     * @public
     */
    public insertMany(records: Partial<TRow>[]) {
        if (records.length === 0) return { changes: 0, lastInsertRowid: 0 };

        const columns = Object.keys(records[0]!);

        const singlePlaceholders = `(${columns.map(() => '?').join(', ')})`;
        const allPlaceholders = records.map(() => singlePlaceholders).join(', ');

        const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES ${allPlaceholders}`;

        const flatValues: unknown[] = [];
        for (const record of records) {
            for (const col of columns) {
                flatValues.push((record as any)[col]);
            }
        }

        
        const res = this.db.getStatement(sql).run(...flatValues);
        return {
            changes: res.changes,
            lastInsertRowId: Number(res.lastInsertRowid)
        }
    }

    /**
     * Executes write assertions, running cell overrides if targeted index boundaries trigger collision states.
     * @param data - An object containing the columns and their values to be inserted or updated.
     * @param conflictTarget - The column name that should be used as the conflict target for the UPSERT operation.
     * @param updateFields - An array of column names that should be updated with the new values from the data object if a conflict occurs.
     * @returns The result of the upsert operation, which typically includes the number of changes made and the last inserted or updated row ID. The exact structure of the result may depend on the underlying SQLite client being used.
     * @public
     */
    public upsert(data: Partial<TRow>, conflictTarget: keyof TRow, updateFields: (keyof TRow)[]) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');
        
        const updateAssigns = updateFields
            .map(col => `${String(col)} = EXCLUDED.${String(col)}`)
            .join(', ');

        const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${String(conflictTarget)}) DO UPDATE SET ${updateAssigns}`;

        
        const res = this.db.getStatement(sql).run(...values);
        return {
            changes: res.changes,
            lastInsertRowId: Number(res.lastInsertRowid)
        }
    }

    /**
     * Pre-compiles execution statement structures bypassing standard lookup evaluations during fast loops.
     * @param action - The type of query to prepare, either 'SELECT' or 'DELETE'.
     * @param column - The column name to apply the WHERE condition on. Should be a key of the table's row type.
     * @param operator - The comparison operator to use in the WHERE condition. Should be one of the defined ComparisonOperator types.
     * @returns Either a SelectQueryBuilder instance for building and executing the SELECT query or a MutationBuilder instance for building and executing the DELETE query, depending on the specified action parameter.
     * @public
     */
    public prepare<K extends keyof TRow>(
        action: 'SELECT' | 'DELETE',
        column: K,
        operator: ComparisonOperator
    ) {
        let sql = ''
        if (action === 'SELECT') {
            sql = `SELECT * FROM ${this.tableName} WHERE ${String(column)} ${operator} ?`;
        } else if (action === 'DELETE') {
            sql = `DELETE FROM ${this.tableName} WHERE ${String(column)} ${operator} ?`;
        }

        const stmt = this.db.getStatement(sql);

        return {
            all: (...params: TRow[K][]): TRow[] => stmt.all(...params) as TRow[],
            get: (...params: TRow[K][]): TRow | undefined => stmt.get(...params) as TRow | undefined,
            run: (...params: TRow[K][]) => stmt.run(...params)
        }
    }
}

/**
 * Isolated type-safe processing context builder managing reading projections.
 * @internal
 */
export class SelectQueryBuilder<TRow, TSelectedKey extends keyof TRow = keyof TRow> {
    private readonly conditions: string[] = [];
    private readonly params: unknown[] = [];
    private limitValue?: number;
    private offsetValue?: number;
    private orderByValue?: string;

    constructor(
        private readonly db: Database,
        private readonly client: GenericSqliteClient,
        private readonly tableName: string,
        private readonly selectedColumns: TSelectedKey[]
    ) {}

    /**
     * Appends evaluation filters to the statement stack. Handles array blocks (`IN`) and `null` values dynamically.
     * @param column - The column name to apply the WHERE condition on. Should be a key of the table's row type.
     * @param operator - The comparison operator to use in the WHERE condition. Should be one of the defined ComparisonOperator types.
     * @param value - The value to compare against. Can be a single value, an array of values (for IN operator), or null (for IS/IS NOT operators).
     * @private
     */
    public where<K extends keyof TRow>(column: K, operator: ComparisonOperator, value: TRow[K] | TRow[K][] | null): this {
        const columnName = String(column);

        if (operator === 'IN' && Array.isArray(value)) {
            const placeholders = value.map(() => '?').join(', ');
            this.conditions.push(`${columnName} IN (${placeholders})`);
            this.params.push(...value);
        } else if ((operator === 'IS' || operator === 'IS NOT') && value === null) {
            this.conditions.push(`${columnName} ${operator} NULL`);
        } else {
            this.conditions.push(`${columnName} ${operator} ?`);
            this.params.push(value);
        }

        return this;
    }

    /**
     * Sets an upper bound constraint on returned rows.
     * @param value - The maximum number of rows to return from the query. Should be a non-negative integer.
     * @public
     */
    public limit(value: number): this {
        this.limitValue = value;
        return this;
    }

    /**
     * Configures a skip index boundary offset for row selections.
     * @param value - The number of rows to skip before starting to return results from the query. Should be a non-negative integer.
     * @public
     */
    public offset(value: number): this {
        this.offsetValue = value;
        return this;
    }

    /**
     * Restructures response sequences based on designated column indices.
     * @param column - The column name to order the results by. Should be a key of the table's row type.
     * @param direction - The direction to order the results, either 'ASC' for ascending or 'DESC' for descending. Defaults to 'ASC' if not specified.
     * @public
     */
    public orderBy(column: keyof TRow, direction: 'ASC' | 'DESC' = 'ASC'): this {
        this.orderByValue = `${String(column)} ${direction}`;
        return this;
    }

    /**
     * Inspects virtual machine planning layers showing indexing behaviors.
     * @returns An array of objects representing the execution plan for the current query.
     * @public
     */
    public explain(): { id: number; parent: number; notused: number; detail: string }[] {
        const originalSql = this.compileSelect();
        const explainSql = `EXPLAIN QUERY PLAN ${originalSql}`;

        return this.client.prepare(explainSql).all(...this.params) as any;
    }
    
    /**
     * Compiles the current state of the query builder into a complete SQL SELECT statement.
     * @returns A string representing the complete SQL SELECT statement based on the current state of the query builder, including selected columns, conditions, ordering, limits, and offsets. This SQL string is ready to be executed against the database to retrieve results.
     * @private
     */
    private compileSelect(): string {
        const projections = this.selectedColumns.length > 0 ? this.selectedColumns.join(', ') : '*';
        let sql = `SELECT ${projections} FROM ${this.tableName}`
        if (this.conditions.length > 0) sql += ` WHERE ${this.conditions.join(' AND ')}`;
        if (this.orderByValue) sql += ` ORDER BY ${this.orderByValue}`;
        if (this.limitValue !== undefined) sql += ` LIMIT ${this.limitValue}`;
        if (this.offsetValue !== undefined) sql += ` OFFSET ${this.offsetValue}`;
        return sql;
    }

    /**
     * Resolves all matching entries into a compiled array list.
     * @returns An array of objects representing the rows returned by the executed SELECT query.
     * @public
     */
    public all(): Pick<TRow, TSelectedKey>[] {
        const query = this.compileSelect();
        return this.db.getStatement(query).all(...this.params) as Pick<TRow, TSelectedKey>[];
    }

    /**
     * Pulls the primary single entry record matching the structured query layout.
     * @returns An object representing a single row returned by the executed SELECT query, with properties corresponding to the selected columns.
     * @public
     */
    public get(): Pick<TRow, TSelectedKey> | undefined {
        const query = this.compileSelect();
        return this.db.getStatement(query).get(...this.params) as Pick<TRow, TSelectedKey> | undefined;
    }

    /**
     * Streams structural entries row-by-row out of memory to guarantee low garbage collection footprints allowing for iteration, if supported by the SQLite client.
     * @public
     */
    public *each(): IterableIterator<Pick<TRow, TSelectedKey>> {
        const sql = this.compileSelect();
        const stmt = this.db.getStatement(sql);

        if (typeof stmt.iterate === 'function') {
            for (const row of stmt.iterate(...this.params)) {
                yield row as Pick<TRow, TSelectedKey>;
            }
        } else {
            const rows = stmt.all(...this.params)
            for (const row of rows) {
                yield row as Pick<TRow, TSelectedKey>
            }
        }
    }
}

/**
 * Isolated mutation pipeline context manager handling table modifications.
 * @internal
 */
export class MutationBuilder<TRow> {
    private readonly conditions: string[] = [];
    private readonly params: unknown[] = [];

    constructor(
        private readonly db: Database,
        private readonly client: GenericSqliteClient,
        private readonly tableName: string,
        private readonly action: 'UPDATE' | 'DELETE',
        private readonly data?: Partial<TRow>
    ) {}

    /**
     * Appends constraints limiting mutation target scopes.
     * @param column - The column name to apply the WHERE condition on. Should be a key of the table's row type.
     * @param operator - The comparison operator to use in the WHERE condition. Should be one of the defined ComparisonOperator types.
     * @param value - The value to compare against. Can be a single value, an array of values (for IN operator), or null (for IS/IS NOT operators).
     * @public
     */

    public where<K extends keyof TRow>(column: K, operator: ComparisonOperator, value: TRow[K] | TRow[K][] | null): this {
        const columnName = String(column);

        if (operator === 'IN' && Array.isArray(value)) {
            const placeholders = value.map(() => '?').join(', ');
            this.conditions.push(`${columnName} IN (${placeholders})`);
            this.params.push(...value);
        } else if ((operator === 'IS' || operator === 'IS NOT') && value === null) {
            this.conditions.push(`${columnName} ${operator} NULL`);
        } else {
            this.conditions.push(`${columnName} ${operator} ?`);
            this.params.push(value);
        }

        return this;
    }

    /**
     * Compiles and executes the data mutation transaction statement context across storage layers.
     * @returns An object containing the number of changes made by the UPDATE or DELETE operation and the last inserted or updated row ID. The exact structure of the result may depend on the underlying SQLite client being used.
     * @public
     */
    public execute() {
        let sql = '';
        let values: unknown[] = [];

        if (this.action === 'UPDATE' && this.data) {
            const setClauses = Object.keys(this.data).map(col => `${col} = ?`).join(', ');
            values = Object.values(this.data);
            sql = `UPDATE ${this.tableName} SET ${setClauses}`;
        } else {
            sql = `DELETE FROM ${this.tableName}`;
        }

        if (this.conditions.length > 0) { 
            sql += ' WHERE ' + this.conditions.join(' AND ');
            values.push(...this.params);
        }

        const result = this.db.getStatement(sql).run(...values);
        return {
            changes: result.changes,
            lastInsertRowid: Number(result.lastInsertRowid)
        }
    }
}