// client/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import Editor from '@monaco-editor/react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import axios from 'axios';
import 'reactflow/dist/style.css';
import './App.css';

// We removed the import for SqlEditor because we are using the Pro Monaco Editor instead.

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function App() {
  const [query, setQuery] = useState('USE querylens_test;\nSELECT * FROM large_orders LIMIT 10;');
  const [activeTab, setActiveTab] = useState('table'); 
  const [currentDb, setCurrentDb] = useState('Checking...');
  
  // Data States
  const [tableData, setTableData] = useState([]);
  const [chartData, setChartData] = useState(null);
  
  // Visualizer States
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowEdges, setFlowEdges] = useState([]);
  const [schemaNodes, setSchemaNodes] = useState([]);
  
  // UI States
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const [loading, setLoading] = useState(false);
  // --- NEW: REF TO EDITOR ---
  const editorRef = useRef(null);

 

  // Reset zoom when switching tabs (Optional, but good UX)
  useEffect(() => {
    setZoom(1.0);
  }, [activeTab]);

 // --- INIT: Load History & Check DB ---

  useEffect(() => {
    const saved = localStorage.getItem('queryHistory');
    if (saved) setHistory(JSON.parse(saved));
    checkDb();
  }, [tableData]); 

  const checkDb = async () => {
    try {
        const res = await axios.get('http://localhost:3001/current-db');
        setCurrentDb(res.data.db);
    } catch (e) { setCurrentDb('Offline'); }
  };

  // --- AI HELPER ---
  const getAISuggestion = (sqlError) => {
    if (!sqlError) return null;
    if (sqlError.includes("syntax")) return "💡 AI Tip: Check for missing semicolons or keywords.";
    if (sqlError.includes("No database selected")) return "💡 AI Tip: Run 'USE database_name;' first.";
    if (sqlError.includes("doesn't exist")) return "💡 AI Tip: Check table name spelling or switch DB.";
    return "💡 AI Tip: Try running a simpler query to isolate the issue.";
  };

  // --- NEW: HANDLE EDITOR MOUNT ---
  // This allows us to access the editor instance to find selected text
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
  };

  // --- RUN QUERY (Updated for Selection) ---
  const runQuery = async (mode = 'all') => {
    setLoading(true);
    setError(null);
    setFlowNodes([]); 

    let queryToExecute = query;

    // 1. CHECK SELECTION LOGIC
    if (mode === 'selected' && editorRef.current) {
        const model = editorRef.current.getModel();
        const selection = editorRef.current.getSelection();
        const selectedText = model.getValueInRange(selection);

        // If user actually highlighted something, use it. Otherwise, warn them.
        if (selectedText && selectedText.trim().length > 0) {
            queryToExecute = selectedText;
        } else {
            alert("⚠️ No text selected! Highlight some code to run 'Run Selected'.");
            setLoading(false);
            return;
        }
    }

    try {
      // 2. Execute
      const execRes = await axios.post('http://localhost:3001/execute', { query: queryToExecute });
      
      if (execRes.data.isSelect) {
        setTableData(execRes.data.results);
        generateChartData(execRes.data.results);
        setActiveTab('table');

        // Save History (Only save if it's a new query)
        const newEntry = { query: queryToExecute.substring(0, 50) + "...", full: queryToExecute, time: new Date().toLocaleTimeString() };
        const newHistory = [newEntry, ...history].slice(0, 15);
        setHistory(newHistory);
        localStorage.setItem('queryHistory', JSON.stringify(newHistory));
      } else {
        setTableData([]);
        setError("✅ Command Executed Successfully");
      }
      
      // 3. Analyze (Only if SELECT)
      const analyzeRes = await axios.post('http://localhost:3001/analyze', { query: queryToExecute });
      generateFlowchart(analyzeRes.data.analysis);

    } catch (err) {
      const msg = err.response?.data?.error || "Connection Failed";
      const tip = getAISuggestion(msg);
      setError(tip ? `❌ ${msg}\n\n${tip}` : `❌ ${msg}`);
    }
    setLoading(false);
  };

  // --- FEATURES ---
  const downloadCSV = () => {
    if (!tableData.length) return;
    const headers = Object.keys(tableData[0]);
    const csvContent = [
        headers.join(','),
        ...tableData.map(row => headers.map(h => `"${row[h]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'results.csv';
    a.click();
  };

  const loadSchema = async () => {
    try {
        const res = await axios.post('http://localhost:3001/schema');
        const nodes = res.data.schema.map((table, i) => ({
            id: `tbl-${table.name}`,
            position: { x: i * 250, y: 0 },
            data: { 
                label: (
                    <div style={{background:'#333', color:'#fff', padding:'10px', border:'1px solid #555', borderRadius:'5px'}}>
                        <strong>{table.name}</strong><hr/>
                        {table.columns.map(c => <div key={c.Field} style={{fontSize:'10px'}}>🔹 {c.Field} <span style={{color:'#888'}}>({c.Type})</span></div>)}
                    </div>
                ) 
            }
        }));
        setSchemaNodes(nodes);
        setActiveTab('schema');
    } catch (e) { setError("Failed to load schema. Ensure a DB is selected."); }
  };

  // --- GENERATORS ---
  const generateChartData = (data) => {
    if (!data || data.length === 0) return setChartData(null);
    const keys = Object.keys(data[0]);
    const labelKey = keys.find(k => typeof data[0][k] === 'string') || keys[0];
    const valueKey = keys.find(k => typeof data[0][k] === 'number');
    if (labelKey && valueKey) {
      setChartData({
        labels: data.map(r => r[labelKey]),
        datasets: [{ label: valueKey.toUpperCase(), data: data.map(r => r[valueKey]), backgroundColor: '#007bff' }]
      });
    } else setChartData(null);
  };

  const generateFlowchart = (analysis) => {
    const color = analysis.score === 'F' ? '#ff4d4d' : '#4caf50';
    setFlowNodes([
        { id: '1', data: { label: 'Start' }, position: { x: 250, y: 0 }, type: 'input' },
        { id: '2', data: { label: 'MySQL Engine' }, position: { x: 250, y: 70 } },
        { id: '3', data: { label: `Score: ${analysis.score}\nRisk: ${analysis.risk}` }, style: { background: color, color: '#fff' }, position: { x: 250, y: 140 } },
        { id: '4', data: { label: analysis.suggestion }, style: { width: 300, fontSize: 12 }, position: { x: 250, y: 220 } }
    ]);
    setFlowEdges([{ id: 'e1', source: '1', target: '2' }, { id: 'e2', source: '2', target: '3' }, { id: 'e3', source: '3', target: '4' }]);
  };

  return (
    <div className="ide-container">
      <div className="header">
        <h1>QueryLens <span>PRO</span></h1>
        
        {/* DB Status Badge */}
        <div className="db-badge">🗄️ DB: <span style={{color:'#4caf50', fontWeight:'bold'}}>{currentDb}</span></div>
        
        {/* --- NEW BUTTON GROUP --- */}
        <div style={{display:'flex', gap:'10px'}}>
            <button 
                className="run-btn" 
                onClick={() => runQuery('all')} 
                disabled={loading}
                title="Executes the entire script (F5)"
            >
                ⚡ Run All
            </button>
            <button 
                className="run-btn" 
                style={{background: 'linear-gradient(135deg, #007bff, #0056b3)'}} // Blue color for distinction
                onClick={() => runQuery('selected')} 
                disabled={loading}
                title="Executes only the highlighted text"
            >
                🖱️ Run Selected
            </button>
        </div>

      </div>

      <div className="workspace">
        {/* HISTORY SIDEBAR */}
        <div className="history-pane" style={{width: '200px', background: '#252526', borderRight: '1px solid #333', padding: '10px', overflowY: 'auto'}}>
            <div className="pane-title">🕒 History</div>
            {history.map((h, i) => (
                <div key={i} onClick={() => setQuery(h.full)} style={{padding:'8px', borderBottom:'1px solid #444', cursor:'pointer', fontSize:'0.8rem', color:'#ccc'}}>
                    <div style={{color:'#007bff', fontWeight:'bold'}}>{h.time}</div>
                    <div style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{h.query}</div>
                </div>
            ))}
        </div>

        {/* EDITOR */}
        <div className="editor-pane" style={{flex: 1}}>
          <div className="pane-title">SQL Editor</div>
          {/* We updated this to use 'onMount' to capture the editor reference */}
          <Editor 
            height="90%" 
            defaultLanguage="sql" 
            theme="vs-dark" 
            value={query} 
            onChange={setQuery} 
            onMount={handleEditorDidMount} // <--- CRITICAL: Connects editor to our code
            options={{minimap:{enabled:false}, fontSize:14}} 
          />
        </div>

        {/* RESULTS */}
        <div className="results-pane">
          <div className="tabs">
            <button className={activeTab==='table'?'active':''} onClick={()=>setActiveTab('table')}>📊 Data</button>
            <button className={activeTab==='chart'?'active':''} onClick={()=>setActiveTab('chart')}>📈 Visuals</button>
            <button className={activeTab==='explain'?'active':''} onClick={()=>setActiveTab('explain')}>⚡ Perf</button>
            <button className={activeTab==='schema'?'active':''} onClick={loadSchema}>🗂️ Schema</button>
            
            {/* --- NEW: ZOOM CONTROLS (Only for Table & Chart) --- */}
            {(activeTab === 'table' || activeTab === 'chart') && (
                <div style={{display:'flex', gap:'5px', marginLeft:'auto', marginRight:'10px'}}>
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} title="Zoom Out">➖</button>
                    <span style={{color:'#888', fontSize:'0.8rem', alignSelf:'center'}}>{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(3.0, z + 0.1))} title="Zoom In">➕</button>
                </div>
            )}

            {activeTab === 'table' && tableData.length > 0 && <button onClick={downloadCSV} className="csv-btn">📥 CSV</button>}
          </div>

          <div className="tab-content">
            {error && <div className="error-banner" style={{whiteSpace: 'pre-wrap'}}>{error}</div>}
            
            {activeTab === 'table' && (
              <div className="table-wrapper">
                {tableData.length > 0 ? (
                  /* --- CHANGE IS HERE: We added style for zoom --- */
                  <table style={{ fontSize: `${zoom}rem` }}>
                    <thead>
                      <tr>
                        {Object.keys(tableData[0]).map(k => <th key={k}>{k}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((r, i) => (
                        <tr key={i}>
                          {Object.values(r).map((v, j) => (
                            <td key={j}>
                              {/* Keep your safety fix here! */}
                              {typeof v === 'object' && v !== null ? JSON.stringify(v) : v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">No Data</div>
                )}
              </div>
            )}
            
            {activeTab === 'chart' && (
                chartData ? (
                    /* 1. Outer div handles scrolling */
                    <div className="chart-wrapper" style={{ overflow: 'auto', position: 'relative' }}>
                        
                        {/* 2. Inner div handles scaling. 
                            We set width/height based on zoom. 
                            'minHeight' ensures it never gets too flat. */}
                        <div style={{ 
                            width: `${zoom * 100}%`, 
                            height: `${zoom * 100}%`, 
                            minHeight: '400px',
                            minWidth: '100%' // Ensures it fills space at minimum
                        }}>
                            <Bar 
                                data={chartData} 
                                options={{
                                    maintainAspectRatio: false, // Critical for zooming!
                                    responsive: true
                                }}
                            />
                        </div>
                    </div>
                ) : <div className="empty-state">No Numeric Data</div>
            )}
            
            {activeTab === 'explain' && (flowNodes.length ? <div className="flow-wrapper"><ReactFlow nodes={flowNodes} edges={flowEdges} fitView><Background/><Controls/></ReactFlow></div> : <div className="empty-state">Run a Query First</div>)}
            
            {activeTab === 'schema' && (schemaNodes.length ? <div className="flow-wrapper"><ReactFlow nodes={schemaNodes} edges={[]} fitView><Background/></ReactFlow></div> : <div className="empty-state">Loading Schema...</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;