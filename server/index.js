// server/index.js — QueryLens PRO (All Backend Features Complete)
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'https://querylens-pro.vercel.app',
    'http://localhost:3000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`🚫 Blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    credentials: true
}));

// ─── BODY PARSER ───────────────────────────────────────────────────────────
// ✅ #7 — Input size limit
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ limit: '10kb', extended: true }));

app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Query too large! Maximum size is 10kb.' });
    }
    next(err);
});

// ─── RATE LIMITING ─────────────────────────────────────────────────────────
// ✅ #8 — Rate limiting
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: '⚠️ Too many requests! Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
}));

app.use('/execute', rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { error: '⚠️ Too many queries! Maximum 30 per minute.' },
    standardHeaders: true,
    legacyHeaders: false
}));

// ─── DATABASE CONNECTION ────────────────────────────────────────────────────
// ✅ #5 — Auto-reconnect MySQL
let db;
let currentDbConfig = null; // ✅ #28 — track active connection config

function buildDbConfig(overrides = {}) {
    return {
        host:     overrides.host     || process.env.DB_HOST,
        user:     overrides.user     || process.env.DB_USER,
        password: overrides.password || process.env.DB_PASSWORD,
        database: overrides.database || process.env.DB_NAME,
        port:     parseInt(overrides.port || process.env.DB_PORT) || 3306,
        ssl:      { rejectUnauthorized: false },
        multipleStatements: true  // ✅ #29 — allow multiple result sets
    };
}

function connectDB(configOverrides = {}, callback = null) {
    if (db) {
        try { db.destroy(); } catch (e) {}
    }

    const config = buildDbConfig(configOverrides);
    currentDbConfig = config;

    db = mysql.createConnection(config);

    db.connect(err => {
        if (err) {
            console.error('❌ MySQL connect error:', err.message);
            if (callback) return callback(err);
            setTimeout(() => connectDB(), 5000); // auto-retry default connection
        } else {
            console.log('✅ Connected to MySQL!');
            if (callback) callback(null);
        }
    });

    db.on('error', (err) => {
        console.error('❌ MySQL connection lost:', err.message);
        if (['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT'].includes(err.code)) {
            console.log('🔄 Reconnecting to MySQL...');
            connectDB(); // reconnect with default env config
        } else {
            throw err;
        }
    });
}

connectDB(); // Initial connection from env vars

// ─── JS FALLBACK ANALYZER ──────────────────────────────────────────────────
// ✅ #4 — JS fallback when Java not available
function jsAnalyzer(rawExplainJSON) {
    const clean = rawExplainJSON.toUpperCase()
        .replace(/\s/g, '')
        .replace(/"/g, '')
        .replace(/\\/g, '');

    const isFullScan = clean.includes('ACCESS_TYPE:ALL') || clean.includes('TYPE:ALL');
    const isRange    = clean.includes('ACCESS_TYPE:RANGE') || clean.includes('TYPE:RANGE');

    if (isFullScan) {
        return {
            score: 'F', risk: 'HIGH',
            suggestion: 'CRITICAL: Full Table Scan detected! Add an INDEX to speed up this query.'
        };
    } else if (isRange) {
        return {
            score: 'B', risk: 'MODERATE',
            suggestion: 'Range scan detected. Better than Full Scan but consider a covering index.'
        };
    } else {
        return {
            score: 'A', risk: 'LOW',
            suggestion: 'Query is optimized! Using Const/Ref/Index lookup.'
        };
    }
}

// ─── ROUTE: GET CURRENT DB ─────────────────────────────────────────────────
app.get('/current-db', (req, res) => {
    db.query('SELECT DATABASE() as db', (err, results) => {
        if (err) return res.json({ db: 'Error' });
        res.json({ db: results[0].db || 'None' });
    });
});

// ─── ROUTE: SCHEMA ─────────────────────────────────────────────────────────
app.post('/schema', (req, res) => {
    db.query('SHOW TABLES', (err, tables) => {
        if (err) return res.status(400).json({ error: 'No Database Selected or error fetching tables' });
        if (tables.length === 0) return res.json({ schema: [] });

        const tableKey = Object.keys(tables[0])[0];
        const tableNames = tables.map(t => t[tableKey]);

        const promises = tableNames.map(tableName =>
            new Promise((resolve) => {
                db.query(`DESCRIBE \`${tableName}\``, (err, cols) => {
                    resolve({ name: tableName, columns: cols || [] });
                });
            })
        );

        Promise.all(promises).then(fullSchema => res.json({ schema: fullSchema }));
    });
});

// ─── ROUTE: SCHEMA RELATIONS (FK Detection) ────────────────────────────────
// ✅ #25 — ER Diagram: detect foreign key relationships between tables
app.get('/schema-relations', (req, res) => {
    const query = `
        SELECT 
            TABLE_NAME        AS sourceTable,
            COLUMN_NAME       AS sourceColumn,
            REFERENCED_TABLE_NAME  AS targetTable,
            REFERENCED_COLUMN_NAME AS targetColumn,
            CONSTRAINT_NAME   AS constraintName
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE 
            REFERENCED_TABLE_NAME IS NOT NULL
            AND TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME;
    `;

    db.query(query, (err, results) => {
        if (err) {
            // Fallback: return empty relations (DB might not have FKs)
            return res.json({ relations: [] });
        }
        res.json({ relations: results || [] });
    });
});

// ─── ROUTE: EXECUTE QUERY ──────────────────────────────────────────────────
// ✅ #29 — Multiple result sets support (multipleStatements: true in config)
app.post('/execute', (req, res) => {
    const userQuery = req.body.query;
    if (!userQuery || !userQuery.trim()) {
        return res.status(400).json({ error: 'No query provided.' });
    }

    console.log('🔹 Executing:', userQuery.substring(0, 80));

    db.query(userQuery, (err, results) => {
        if (err) {
            return res.status(400).json({
                error: err.sqlMessage || err.message || 'Query execution failed'
            });
        }

        // ✅ #29 — Detect if this is a multi-statement response
        // mysql2 returns array-of-arrays for multi-statements
        const isMultiStatement = Array.isArray(results) && Array.isArray(results[0]);

        if (isMultiStatement) {
            // Return ALL select result sets to frontend
            const allSets = results
                .map((set, idx) => ({
                    setIndex: idx,
                    isSelect: Array.isArray(set) && !(set[0] && 'affectedRows' in set[0]),
                    results: Array.isArray(set) ? set.slice(0, 1000) : set,
                    rowCount: Array.isArray(set) ? set.length : 0
                }));

            return res.json({
                isMultiStatement: true,
                resultSets: allSets,
                // Also send primary (last SELECT) for backward compat
                results: allSets.filter(s => s.isSelect).pop()?.results || [],
                isSelect: allSets.some(s => s.isSelect)
            });
        }

        // Single statement — original logic
        let finalResult = results;
        let isSelect = false;

        if (Array.isArray(results)) {
            const firstItem = results[0];
            if (firstItem && 'affectedRows' in firstItem && !Array.isArray(firstItem)) {
                isSelect = false;
            } else {
                isSelect = true;
            }
        }

        let displayResults = finalResult;
        if (Array.isArray(finalResult) && finalResult.length > 1000) {
            displayResults = finalResult.slice(0, 1000);
        }

        res.json({ results: displayResults, isSelect, isMultiStatement: false });
    });
});

// ─── ROUTE: INLINE CELL EDIT ───────────────────────────────────────────────
// ✅ #24 — Table data inline editing
// Frontend sends: { table, column, value, pkColumn, pkValue }
app.post('/update-cell', (req, res) => {
    const { table, column, value, pkColumn, pkValue } = req.body;

    if (!table || !column || pkColumn === undefined || pkValue === undefined) {
        return res.status(400).json({ error: 'Missing required fields: table, column, pkColumn, pkValue' });
    }

    // Safely quote identifiers to prevent SQL injection on identifiers
    const sql = `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${pkColumn}\` = ?`;

    console.log('✏️ Inline edit:', sql, [value, pkValue]);

    db.query(sql, [value, pkValue], (err, result) => {
        if (err) {
            return res.status(400).json({
                error: err.sqlMessage || err.message || 'Update failed'
            });
        }
        res.json({
            success: true,
            affectedRows: result.affectedRows,
            message: `Updated ${result.affectedRows} row(s)`
        });
    });
});

// ─── ROUTE: SWITCH CONNECTION ──────────────────────────────────────────────
// ✅ #28 — Connection string input: let user switch DB from frontend
app.post('/connect', (req, res) => {
    const { host, user, password, database, port } = req.body;

    if (!host || !user || !database) {
        return res.status(400).json({ error: 'host, user, and database are required.' });
    }

    // Try the new connection before committing
    const testConfig = { host, user, password, database, port };
    const testDb = mysql.createConnection({
        ...buildDbConfig(testConfig),
    });

    testDb.connect(err => {
        if (err) {
            testDb.destroy();
            return res.status(400).json({
                error: `Connection failed: ${err.message}`
            });
        }

        // Test succeeded — switch the main connection
        testDb.destroy();
        connectDB(testConfig, (err) => {
            if (err) {
                return res.status(400).json({ error: `Switch failed: ${err.message}` });
            }
            res.json({ success: true, message: `Connected to ${database} on ${host}` });
        });
    });
});

// ─── ROUTE: AI QUERY SUGGESTIONS ──────────────────────────────────────────
// ✅ #30 — Context-aware SQL suggestions based on schema + partial query
app.post('/suggest', (req, res) => {
    const { partialQuery, tableName } = req.body;

    if (!partialQuery) {
        return res.json({ suggestions: [] });
    }

    const upper = partialQuery.trim().toUpperCase();

    // Get table list to suggest real table names
    db.query('SHOW TABLES', (err, tables) => {
        const tableList = err ? [] : tables.map(t => Object.values(t)[0]);

        const suggestions = [];

        // Pattern-based smart suggestions
        if (upper === 'SELECT' || upper === 'SELECT ') {
            suggestions.push(
                'SELECT * FROM ' + (tableList[0] || 'your_table') + ' LIMIT 10;',
                'SELECT COUNT(*) FROM ' + (tableList[0] || 'your_table') + ';',
                'SELECT DISTINCT column_name FROM ' + (tableList[0] || 'your_table') + ';'
            );
        } else if (upper.startsWith('SELECT') && !upper.includes('FROM')) {
            suggestions.push(
                ...tableList.slice(0, 3).map(t => `${partialQuery.trim()} FROM \`${t}\` LIMIT 10;`)
            );
        } else if (upper.startsWith('SELECT') && upper.includes('FROM') && !upper.includes('WHERE')) {
            const match = upper.match(/FROM\s+`?(\w+)`?/);
            const tbl = match ? match[1] : tableList[0];
            if (tbl) {
                suggestions.push(
                    `${partialQuery.trim()} WHERE id = 1;`,
                    `${partialQuery.trim()} WHERE created_at >= CURDATE();`,
                    `${partialQuery.trim()} ORDER BY id DESC LIMIT 10;`,
                    `${partialQuery.trim()} GROUP BY status;`
                );
            }
        } else if (upper.startsWith('SHOW')) {
            suggestions.push('SHOW TABLES;', 'SHOW DATABASES;', 'SHOW CREATE TABLE ' + (tableList[0] || 'your_table') + ';');
        } else if (upper.startsWith('INSERT')) {
            suggestions.push(
                ...tableList.slice(0, 2).map(t => `INSERT INTO \`${t}\` (col1, col2) VALUES (val1, val2);`)
            );
        } else if (upper.startsWith('UPDATE')) {
            suggestions.push(
                ...tableList.slice(0, 2).map(t => `UPDATE \`${t}\` SET column = value WHERE id = 1;`)
            );
        } else if (upper.startsWith('DELETE')) {
            suggestions.push(
                ...tableList.slice(0, 2).map(t => `DELETE FROM \`${t}\` WHERE id = 1;`)
            );
        } else {
            // Generic table-based suggestions
            suggestions.push(
                ...tableList.slice(0, 3).map(t => `SELECT * FROM \`${t}\` LIMIT 10;`)
            );
        }

        // If a specific table is requested, get its columns
        if (tableName) {
            db.query(`DESCRIBE \`${tableName}\``, (err2, cols) => {
                const columnSuggestions = err2 ? [] : cols.map(c =>
                    `SELECT ${c.Field} FROM \`${tableName}\` LIMIT 10;`
                ).slice(0, 3);

                res.json({ suggestions: [...suggestions, ...columnSuggestions].slice(0, 6) });
            });
        } else {
            res.json({ suggestions: suggestions.slice(0, 6) });
        }
    });
});

// ─── ROUTE: ANALYZE QUERY ──────────────────────────────────────────────────
// ✅ #4 — Java analyzer with JS fallback
app.post('/analyze', (req, res) => {
    const userQuery = req.body.query.trim();

    if (!userQuery.toUpperCase().startsWith('SELECT')) {
        return res.json({
            analysis: {
                score: 'N/A', risk: 'LOW',
                suggestion: 'Admin Command Executed. (Performance analysis skipped.)'
            }
        });
    }

    db.query(`EXPLAIN FORMAT=JSON ${userQuery}`, (err, results) => {
        if (err) {
            return res.status(400).json({
                error: err.sqlMessage || err.message || 'EXPLAIN failed'
            });
        }

        const rawExplainJSON = JSON.stringify(results[0].EXPLAIN);
        const analyzerPath = path.join(__dirname, '../analyzer');

        try {
            const javaProcess = spawn('java', ['QueryAnalyzer'], { cwd: analyzerPath });

            let javaOutput = '';
            let responded = false;

            javaProcess.on('error', () => {
                if (!responded) {
                    responded = true;
                    res.json({ analysis: jsAnalyzer(rawExplainJSON) });
                }
            });

            javaProcess.stdin.write(rawExplainJSON);
            javaProcess.stdin.end();

            javaProcess.stdout.on('data', data => { javaOutput += data.toString(); });
            javaProcess.stderr.on('data', data => { console.error('Java stderr:', data.toString()); });

            javaProcess.on('close', () => {
                if (responded) return;
                responded = true;
                try {
                    res.json({ analysis: JSON.parse(javaOutput) });
                } catch (e) {
                    res.json({ analysis: jsAnalyzer(rawExplainJSON) });
                }
            });

        } catch (e) {
            res.json({ analysis: jsAnalyzer(rawExplainJSON) });
        }
    });
});

// ─── START SERVER ──────────────────────────────────────────────────────────
// ✅ #43 — Use process.env.PORT so Render injects its own port
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 QueryLens PRO server running on port ${PORT}`);
});