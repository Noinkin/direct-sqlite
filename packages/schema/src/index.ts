/**
 * Core primitive SQL types
 * @public
 */
export type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'

/**
 * @public
 */
export interface ColumnBuilder<T extends ColumnType, TRuntimeType, TNullable extends boolean = true> {
    type: T;
    isNullable: TNullable,
    isPrimaryKey: boolean;
    isAutoIncrement: boolean;

    notNull(): ColumnBuilder<T, TRuntimeType, false>;
    primaryKey(): ColumnBuilder<T, TRuntimeType, TNullable>;
    autoIncrement(): ColumnBuilder<T, TRuntimeType, TNullable>;
}

/**
 * Creates a table column
 * @param type - Column Type
 * @returns Column
 * @internal
 */
export function createColumn<T extends ColumnType, TRuntimeType>(type: T): ColumnBuilder<T, TRuntimeType, true> {
    const col: ColumnBuilder<T, TRuntimeType, true> = {
        type,
        isNullable: true,
        isPrimaryKey: false,
        isAutoIncrement: false,
        notNull() {
            (this as any).isNullable = false;
            return this as any;
        },
        primaryKey() {
            (this as any).isPrimaryKey = true;
            return this;
        },
        autoIncrement() {
            (this as any).isAutoIncrement = true;
            return this;
        }
    }
    return col;
}

/**
 * Represents a text type in a table
 * @public
 */
export const text = () => createColumn<'TEXT', string>('TEXT');

/**
 * Represents an integer type in a table
 * @public
 */
export const integer = () => createColumn<'INTEGER', number>('INTEGER');

/**
 * Represents a real type in a table
 * @public
 */
export const real = () => createColumn<'REAL', number>('REAL');

/**
 * Represents a blob type in a table
 * @public
 */
export const blob = () => createColumn<'BLOB', Buffer>('BLOB');

/**
 * Represents a boolean(0 or 1) type in a table
 * @public
 */
export const boolean = () => createColumn<'INTEGER', 1 | 0>('INTEGER');

/**
 * Represents a timestamp(text) type in a table
 * @public 
 */
export const timestamp = () => createColumn<'TEXT', string>('TEXT');

/**
 * Represents a json(text) type in a table
 * @public
 */
export const json = <TStructure extends Record<string, any>>() => createColumn<'TEXT', TStructure>('TEXT');

/**
 * @public
 */
export type InferColumn<T> = T extends ColumnBuilder<any, infer TRuntimeType, infer Nullable>
    ? TRuntimeType | (Nullable extends true ? null : never)
    : never;

/**
 * @public
 */
export type InferSchema<T> = {
    [K in keyof T]: InferColumn<T[K]>;
}

/**
 * Creates a table schema
 * @param name - Table Name
 * @param columns - Table Columns
 * @returns Table
 * @public
 */
export function table<TDefs extends Record<string, ColumnBuilder<any, any, any>>>(name: string, columns: TDefs) {
    const colDefs = Object.entries(columns)
        .map(([colName, colConfig]) => {
            let stmt = `${colName} ${colConfig.type}`;
            if (colConfig.isPrimaryKey) stmt += ' PRIMARY KEY';
            if (colConfig.isAutoIncrement) stmt += ' AUTOINCREMENT';
            if (!colConfig.isNullable) stmt += ' NOT NULL';
            return stmt;
        })
        .join(', ')

    const createSql = `CREATE TABLE IF NOT EXISTS ${name} (${colDefs}) STRICT;`;

    return {
        $name: name,
        $columns: columns,
        $createSql: createSql,
        $infer: {} as InferSchema<TDefs>
    }
}