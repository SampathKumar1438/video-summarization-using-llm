import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../storage/database.sqlite');

let db = null;
let SQL = null;

/**
 * Wrapper class to provide better-sqlite3 compatible API for sql.js
 */
class PreparedStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    try {
      this.db.run(this.sql, params);
      // sql.js doesn't have lastInsertRowid on run, we need to query it
      const result = this.db.exec('SELECT last_insert_rowid() as id');
      const lastInsertRowid = result.length > 0 ? result[0].values[0][0] : 0;
      const changes = this.db.getRowsModified();
      saveDatabase(); // Auto-save after modification
      return { lastInsertRowid, changes };
    } catch (error) {
      console.error('SQL run error:', error.message, 'SQL:', this.sql);
      throw error;
    }
  }

  get(...params) {
    try {
      const stmt = this.db.prepare(this.sql);
      stmt.bind(params);
      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        stmt.free();
        const row = {};
        columns.forEach((col, i) => {
          row[col] = values[i];
        });
        return row;
      }
      stmt.free();
      return undefined;
    } catch (error) {
      console.error('SQL get error:', error.message, 'SQL:', this.sql);
      throw error;
    }
  }

  all(...params) {
    try {
      const stmt = this.db.prepare(this.sql);
      stmt.bind(params);
      const results = [];
      const columns = stmt.getColumnNames();
      while (stmt.step()) {
        const values = stmt.get();
        const row = {};
        columns.forEach((col, i) => {
          row[col] = values[i];
        });
        results.push(row);
      }
      stmt.free();
      return results;
    } catch (error) {
      console.error('SQL all error:', error.message, 'SQL:', this.sql);
      throw error;
    }
  }
}

/**
 * Database wrapper to provide better-sqlite3 compatible API
 */
class DatabaseWrapper {
  constructor(sqlDb) {
    this.sqlDb = sqlDb;
    this.inTransaction = false;
  }

  prepare(sql) {
    return new PreparedStatement(this.sqlDb, sql);
  }

  exec(sql) {
    this.sqlDb.exec(sql);
    if (!this.inTransaction) {
      saveDatabase();
    }
  }

  pragma(statement) {
    // sql.js handles pragmas differently, just execute it
    try {
      this.sqlDb.exec(`PRAGMA ${statement}`);
    } catch (e) {
      // Ignore pragma errors as some may not apply
    }
  }

  transaction(fn) {
    return (...args) => {
      this.sqlDb.exec('BEGIN TRANSACTION');
      this.inTransaction = true;
      try {
        const result = fn(...args);
        this.sqlDb.exec('COMMIT');
        this.inTransaction = false;
        saveDatabase();
        return result;
      } catch (error) {
        console.error('Transaction failed:', error);
        try {
          this.sqlDb.exec('ROLLBACK');
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError);
        }
        this.inTransaction = false; // Always reset
        throw error;
      }
    };
  }

  close() {
    saveDatabase();
    this.sqlDb.close();
  }
}

/**
 * Save database to file
 */
function saveDatabase() {
  if (db && db.sqlDb) {
    // Don't save if in transaction
    if (db.inTransaction) return;

    try {
      const data = db.sqlDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DATABASE_PATH, buffer);
    } catch (error) {
      console.error('Error saving database:', error.message);
    }
  }
}

/**
 * Initialize the database connection and create tables
 */
export async function initDatabase() {
  // Ensure the storage directory exists
  const storageDir = path.dirname(DATABASE_PATH);
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  // Initialize SQL.js
  if (!SQL) {
    SQL = await initSqlJs();
  }

  // Load existing database or create new one
  let sqlDb;
  if (fs.existsSync(DATABASE_PATH)) {
    const fileBuffer = fs.readFileSync(DATABASE_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  // Create wrapper
  db = new DatabaseWrapper(sqlDb);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Read and execute schema
  const schemaPath = path.join(__dirname, '../models/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Split by semicolons and execute each statement
  const statements = schema.split(';').filter(s => s.trim());
  for (const statement of statements) {
    try {
      db.sqlDb.exec(statement);
    } catch (error) {
      // Ignore "already exists" errors for IF NOT EXISTS statements
      if (!error.message.includes('already exists')) {
        console.error('Error executing statement:', error.message);
      }
    }
  }

  // Save initial database state
  saveDatabase();

  console.log('Database initialized successfully');
  return db;
}

/**
 * Get the database instance
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
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export default { initDatabase, getDatabase, closeDatabase };
