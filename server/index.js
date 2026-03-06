// server/index.js (FINAL PRO VERSION)
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process'); 
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- DATABASE CONNECTION (Server Level) ---
require('dotenv').config(); 

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect(err => {
    if (err) console.error('❌ Error connecting to MySQL:', err.message);
    else console.log('✅ Connected to MySQL Server! (Root Access)');
});

// --- ROUTE: GET CURRENT DB NAME ---
app.get('/current-db', (req, res) => {
    db.query('SELECT DATABASE() as db', (err, results) => {
        if (err) return res.json({ db: 'Error' });
        res.json({ db: results[0].db || 'None' });
    });
});

// --- ROUTE: GET SCHEMA (TABLES & COLUMNS) ---
app.post('/schema', (req, res) => {
    db.query('SHOW TABLES', (err, tables) => {
        if (err) return res.status(400).json({ error: "No Database Selected or Error fetching tables" });
        if (tables.length === 0) return res.json({ schema: [] });

        const tableKey = Object.keys(tables[0])[0]; 
        const tableNames = tables.map(t => t[tableKey]);

        // Get columns for all tables
        const promises = tableNames.map(tableName => {
            return new Promise((resolve) => {
                db.query(`DESCRIBE ${tableName}`, (err, cols) => {
                    resolve({ name: tableName, columns: cols || [] });
                });
            });
        });

        Promise.all(promises).then(fullSchema => {
            res.json({ schema: fullSchema });
        });
    });
});

// --- ROUTE: EXECUTE QUERY ---
// --- ROUTE: EXECUTE QUERY ---
app.post('/execute', (req, res) => {
    const userQuery = req.body.query;
    console.log("🔹 Executing:", userQuery.substring(0, 50) + "...");
    
    db.query(userQuery, (err, results) => {
        if (err) return res.status(400).json({ error: err.message });

        let finalResult = results;
        let isSelect = false;

        if (Array.isArray(results)) {
           
            
            const firstItem = results[0];
            const isMultiStatement = Array.isArray(firstItem) || (firstItem && 'affectedRows' in firstItem && results.length > 1);

            if (isMultiStatement) {
               
                const lastSelect = results.reverse().find(r => Array.isArray(r));
                if (lastSelect) {
                    finalResult = lastSelect;
                    isSelect = true;
                } else {
                    
                    finalResult = results[0]; 
                    isSelect = false;
                }
            } else {
                
                if (firstItem && 'affectedRows' in firstItem && !Array.isArray(firstItem)) {
                   
                    isSelect = false;
                } else {
                    
                    isSelect = true;
                }
            }
        }

        // Safety Truncate for large data
        let displayResults = finalResult;
        if (Array.isArray(finalResult) && finalResult.length > 1000) {
            displayResults = finalResult.slice(0, 1000); 
        }

        res.json({
            results: displayResults,
            isSelect: isSelect
        });
    });
});

// --- ROUTE: ANALYZE QUERY (JAVA) ---
app.post('/analyze', (req, res) => {
    const userQuery = req.body.query.trim();
    
    // Guard: Only analyze SELECT queries
    if (!userQuery.toUpperCase().startsWith('SELECT')) {
        return res.json({ 
            analysis: { 
                score: 'N/A', risk: 'LOW', 
                suggestion: 'Admin Command Executed. (Performance analysis skipped).' 
            } 
        });
    }

    const explainQuery = `EXPLAIN FORMAT=JSON ${userQuery}`;

    db.query(explainQuery, (err, results) => {
        if (err) return res.status(400).json({ error: err.message });

        const rawExplainJSON = JSON.stringify(results[0].EXPLAIN);
        const analyzerPath = path.join(__dirname, '../analyzer'); 
        
        
        const javaProcess = spawn('java', ['QueryAnalyzer'], { cwd: analyzerPath });

        let javaOutput = '';

        javaProcess.stdin.write(rawExplainJSON);
        javaProcess.stdin.end();

        javaProcess.stdout.on('data', (data) => javaOutput += data.toString());
        javaProcess.stderr.on('data', (data) => console.error(`Java Error: ${data}`));

        javaProcess.on('close', (code) => {
            try {
                const analysis = JSON.parse(javaOutput);
                res.json({ analysis: analysis });
            } catch (e) {
                console.error("Parse Error:", javaOutput);
                res.status(500).json({ error: "Java analysis failed" });
            }
        });
    });
});

app.listen(3001, () => {
    console.log('🚀 Server running on port 3001');
});