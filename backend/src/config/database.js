import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection configuration
// Support both individual env vars and DATABASE_URL
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'checkmate',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'acheron#132',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

const pool = new pg.Pool(dbConfig);

// Handle pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

/**
 * Database wrapper class to provide a consistent API
 * Similar interface to previous sql.js implementation but async
 */
class Database {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Execute a query with parameters
     * @param {string} sql - SQL query with $1, $2, etc. placeholders
     * @param {Array} params - Query parameters
     * @returns {Promise<{rows: Array, rowCount: number}>}
     */
    async query(sql, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            return result;
        } finally {
            client.release();
        }
    }

    /**
     * Get a single row
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object|undefined>}
     */
    async get(sql, params = []) {
        const result = await this.query(sql, params);
        return result.rows[0];
    }

    /**
     * Get all matching rows
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>}
     */
    async all(sql, params = []) {
        const result = await this.query(sql, params);
        return result.rows;
    }

    /**
     * Execute an insert/update/delete and return affected info
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<{lastInsertRowid: number, changes: number}>}
     */
    async run(sql, params = []) {
        // For INSERT queries, append RETURNING id to get lastInsertRowid
        let modifiedSql = sql;
        const isInsert = sql.trim().toUpperCase().startsWith('INSERT');

        if (isInsert && !sql.toUpperCase().includes('RETURNING')) {
            modifiedSql = sql.replace(/;?\s*$/, ' RETURNING id');
        }

        const result = await this.query(modifiedSql, params);

        return {
            lastInsertRowid: result.rows[0]?.id || 0,
            changes: result.rowCount
        };
    }

    /**
     * Execute raw SQL (for schema creation, etc.)
     * @param {string} sql - SQL statements
     */
    async exec(sql) {
        const client = await this.pool.connect();
        try {
            await client.query(sql);
        } finally {
            client.release();
        }
    }

    /**
     * Begin a transaction
     * @returns {Promise<pg.PoolClient>}
     */
    async beginTransaction() {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return client;
    }

    /**
     * Commit a transaction
     * @param {pg.PoolClient} client
     */
    async commitTransaction(client) {
        await client.query('COMMIT');
        client.release();
    }

    /**
     * Rollback a transaction
     * @param {pg.PoolClient} client
     */
    async rollbackTransaction(client) {
        await client.query('ROLLBACK');
        client.release();
    }

    /**
     * Close the pool
     */
    async close() {
        await this.pool.end();
    }
}

let db = null;

/**
 * Initialize the database connection and create tables
 */
export async function initDatabase() {
    try {
        // Create database wrapper
        db = new Database(pool);

        // Test connection
        await db.query('SELECT NOW()');
        console.log('PostgreSQL connection established');

        // Read and execute schema
        const schemaPath = path.join(__dirname, '../models/schema_postgres.sql');

        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf-8');

            // Execute schema (PostgreSQL handles IF NOT EXISTS properly)
            await db.exec(schema);
            console.log('Database schema initialized');
        } else {
            console.warn('Schema file not found:', schemaPath);
        }

        console.log('Database initialized successfully');
        return db;
    } catch (error) {
        console.error('Database initialization error:', error.message);
        throw error;
    }
}

/**
 * Get the database instance
 * @returns {Database}
 */
export function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Close the database connection
 */
export async function closeDatabase() {
    if (db) {
        await db.close();
        db = null;
    }
}

export default { initDatabase, getDatabase, closeDatabase };
