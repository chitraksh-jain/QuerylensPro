// client/src/App.js — QueryLens PRO (All 43 Features — Fixed)
import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import axios from "axios";
import { format } from "sql-formatter";
import * as XLSX from "xlsx";
import "reactflow/dist/style.css";
import "./App.css";

// ✅ #40 — Lazy load Monaco Editor (smaller initial bundle)
const Editor = lazy(() => import("@monaco-editor/react"));

// ✅ #42 — One place to change backend URL
const BACKEND_URL = "https://querylenspro.onrender.com";

axios.defaults.timeout = 60000;

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ─────────────────────────────────────────────────────────────
// ✅ #41 — Extracted sub-components
// ─────────────────────────────────────────────────────────────

const ToastContainer = ({ toasts }) => (
  <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
    {toasts.map((t) => (
      <div key={t.id} style={{
        background: t.type === "error" ? "#c0392b" : t.type === "warning" ? "#d35400" : "#27ae60",
        color: "#fff", padding: "10px 18px", borderRadius: "8px",
        fontSize: "0.84rem", fontWeight: "600",
        boxShadow: "0 4px 16px rgba(0,0,0,0.45)", maxWidth: "340px",
        animation: "toastIn 0.3s ease",
      }}>
        {t.message}
      </div>
    ))}
  </div>
);

const EmptyState = ({ icon, title, subtitle }) => (
  <div className="empty-state">
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "2.8rem", marginBottom: "10px", opacity: 0.55 }}>{icon}</div>
      <div style={{ fontSize: "0.95rem", fontWeight: "600", color: "#888", marginBottom: "5px" }}>{title}</div>
      <div style={{ fontSize: "0.8rem", color: "#555" }}>{subtitle}</div>
    </div>
  </div>
);

const Pagination = ({ currentPage, totalPages, rowCount, onPageChange, darkMode }) => {
  if (totalPages <= 1) return null;
  const btn = {
    padding: "4px 10px", cursor: "pointer", background: "transparent",
    border: darkMode ? "1px solid #555" : "1px solid #ddd",
    color: darkMode ? "#ccc" : "#333", borderRadius: "5px",
    fontFamily: "inherit", fontSize: "0.82rem",
    transition: "all 0.12s ease",
  };
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "10px 16px", background: darkMode ? "#252526" : "#f5f5f5", borderTop: darkMode ? "1px solid #333" : "1px solid #ddd", flexWrap: "wrap", flexShrink: 0 }}>
      <button onClick={() => onPageChange(1)} disabled={currentPage === 1} style={btn}>«</button>
      <button onClick={() => onPageChange(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={btn}>‹</button>
      <span style={{ color: darkMode ? "#888" : "#555", fontSize: "0.8rem" }}>
        Page {currentPage} of {totalPages} &nbsp;·&nbsp; {rowCount} rows
      </span>
      <button onClick={() => onPageChange(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={btn}>›</button>
      <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} style={btn}>»</button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────

function App() {
  const [darkMode, setDarkMode] = useState(true);

  // Query tabs
  const [queryTabs, setQueryTabs] = useState([{ id: 1, title: "Query 1", query: "SELECT 1;" }]);
  const [activeQueryTab, setActiveQueryTab] = useState(1);
  const [query, setQuery] = useState("SELECT 1;");

  // Results
  const [activeTab, setActiveTab] = useState("table");
  const [currentDb, setCurrentDb] = useState("Checking...");
  const [tableData, setTableData] = useState([]);
  const [activeTableName, setActiveTableName] = useState("");
  const [chartData, setChartData] = useState(null);

  // Visualizer
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowEdges, setFlowEdges] = useState([]);
  const [schemaNodes, setSchemaNodes] = useState([]);
  const [schemaEdges, setSchemaEdges] = useState([]);

  // ✅ #29 — Multiple result sets
  const [multiResultSets, setMultiResultSets] = useState([]);
  const [activeResultSet, setActiveResultSet] = useState(0);

  // UI
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [execTime, setExecTime] = useState(null);
  const [rowCount, setRowCount] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  // ✅ #20 — Filter
  const [searchFilter, setSearchFilter] = useState("");

  // ✅ #21 — Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;

  // ✅ #22 — Bookmarks
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // ✅ #24 — Inline edit
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");

  // ✅ #26 — History search
  const [historySearch, setHistorySearch] = useState("");

  // ✅ #27 — Pinned
  const [pinnedQueries, setPinnedQueries] = useState([]);

  // ✅ #28 — Connection modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connForm, setConnForm] = useState({ host: "", user: "", password: "", database: "", port: "3306" });
  const [connLoading, setConnLoading] = useState(false);

  // ✅ #30 — AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState([]);

  // ✅ #32 — Resizable panels
  const [editorWidth, setEditorWidth] = useState(40);
  const [resultsWidth, setResultsWidth] = useState(45);
  const isResizing = useRef(false);
  const resizeTarget = useRef(null);
  const resizeStart = useRef(0);
  const resizeStartWidth = useRef(0);

  // ✅ #34 — Cell copy feedback
  const [copiedCell, setCopiedCell] = useState(null);

  // ✅ #36 — Toasts
  const [toasts, setToasts] = useState([]);

  // ✅ #39 — Cache
  const queryCache = useRef({});

  // Refs
  const editorRef = useRef(null);
  const monacoRef = useRef(null); // ✅ FIX: was window.monaco — now a proper ref (removes red dot)
  const suggestTimeout = useRef(null);

  // ── TOAST ────────────────────────────────────────────────────
  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── DB CHECK ─────────────────────────────────────────────────
  const checkDb = useCallback(async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/current-db`);
      setCurrentDb(res.data.db);
    } catch {
      setCurrentDb("Offline");
    }
  }, []);

  // ── INIT EFFECT ──────────────────────────────────────────────
  useEffect(() => {
    try {
      const h = localStorage.getItem("queryHistory");
      if (h) setHistory(JSON.parse(h));
      const b = localStorage.getItem("queryBookmarks");
      if (b) setBookmarks(JSON.parse(b));
      const p = localStorage.getItem("pinnedQueries");
      if (p) setPinnedQueries(JSON.parse(p));
    } catch (e) { console.warn("Load error:", e); }
    checkDb();
  }, [checkDb]);

  // ── RESET ON TAB CHANGE ──────────────────────────────────────
  useEffect(() => {
    setZoom(1.0);
    setSearchFilter("");
    setCurrentPage(1);
  }, [activeTab]);

  // ── RESIZE HANDLERS ──────────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizing.current) return;
      const dx = e.clientX - resizeStart.current;
      const pct = (dx / window.innerWidth) * 100;
      if (resizeTarget.current === "editor")
        setEditorWidth(() => Math.min(70, Math.max(20, resizeStartWidth.current + pct)));
      else
        setResultsWidth(() => Math.min(70, Math.max(20, resizeStartWidth.current - pct)));
    };
    const onMouseUp = () => {
      isResizing.current = false;
      resizeTarget.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startResize = (target, e, currentWidth) => {
    e.preventDefault();
    isResizing.current = true;
    resizeTarget.current = target;
    resizeStart.current = e.clientX;
    resizeStartWidth.current = currentWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // ── AI SUGGESTIONS ───────────────────────────────────────────
  // ✅ #30 — debounced, fires 800ms after typing stops
  useEffect(() => {
    if (!query || query.trim().length < 4) { setAiSuggestions([]); return; }
    clearTimeout(suggestTimeout.current);
    suggestTimeout.current = setTimeout(async () => {
      try {
        const res = await axios.post(`${BACKEND_URL}/suggest`, {
          partialQuery: query.trim(),
          tableName: activeTableName || undefined,
        });
        setAiSuggestions(res.data.suggestions || []);
      } catch { setAiSuggestions([]); }
    }, 800);
    return () => clearTimeout(suggestTimeout.current);
  }, [query, activeTableName]);

  // ── KEYBOARD SHORTCUTS ───────────────────────────────────────
  // ✅ #23 — Use refs for latest function versions to avoid stale closure
  const runQueryRef = useRef(null);
  const saveBookmarkRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        if (runQueryRef.current) runQueryRef.current("all");
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        if (runQueryRef.current) runQueryRef.current("selected");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (saveBookmarkRef.current) saveBookmarkRef.current();
      }
      if (e.key === "Escape") {
        setEditingCell(null);
        setShowConnectModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // empty deps — safe because we use refs

  // ── RESIZE HANDLE STYLE ──────────────────────────────────────
  const resizerStyle = {
    width: "5px", flexShrink: 0, cursor: "col-resize",
    background: darkMode ? "#333" : "#ddd",
    borderLeft: darkMode ? "1px solid #444" : "1px solid #ccc",
    borderRight: darkMode ? "1px solid #444" : "1px solid #ccc",
    transition: "background 0.2s ease",
  };

  // ── QUERY TABS ───────────────────────────────────────────────
  const addQueryTab = () => {
    const id = Date.now();
    setQueryTabs(prev => [...prev, { id, title: `Query ${prev.length + 1}`, query: "SELECT 1;" }]);
    setActiveQueryTab(id);
    setQuery("SELECT 1;");
  };

  const closeQueryTab = (id) => {
    if (queryTabs.length === 1) return;
    const remaining = queryTabs.filter(t => t.id !== id);
    setQueryTabs(remaining);
    const last = remaining[remaining.length - 1];
    setActiveQueryTab(last.id);
    setQuery(last.query);
  };

  const switchQueryTab = (tab) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTab ? { ...t, query } : t));
    setActiveQueryTab(tab.id);
    setQuery(tab.query);
  };

  // ── EXPORT ───────────────────────────────────────────────────
  const downloadCSV = () => {
    if (!tableData.length) return;
    const headers = Object.keys(tableData[0]);
    const csv = [headers.join(","), ...tableData.map(row => headers.map(h => `"${row[h]}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "results.csv";
    a.click();
    showToast("📥 CSV downloaded!");
  };

  const downloadExcel = () => {
    if (!tableData.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tableData), "Results");
    XLSX.writeFile(wb, "querylens_results.xlsx");
    showToast("📊 Excel downloaded!");
  };

  // ── BOOKMARKS ────────────────────────────────────────────────
  const saveBookmark = useCallback(() => {
    const name = prompt("Bookmark name:");
    if (!name) return;
    setBookmarks(prev => {
      const updated = [{ id: Date.now(), name, query, time: new Date().toLocaleString() }, ...prev].slice(0, 20);
      try { localStorage.setItem("queryBookmarks", JSON.stringify(updated)); } catch (e) { console.warn(e); }
      return updated;
    });
    showToast("🔖 Bookmarked!");
  }, [query, showToast]);

  // Keep ref in sync so keyboard shortcut always has latest version
  saveBookmarkRef.current = saveBookmark;

  const deleteBookmark = (id) => {
    setBookmarks(prev => {
      const updated = prev.filter(b => b.id !== id);
      try { localStorage.setItem("queryBookmarks", JSON.stringify(updated)); } catch (e) { console.warn(e); }
      return updated;
    });
  };

  // ── PIN QUERIES ──────────────────────────────────────────────
  const pinQuery = (h) => {
    if (pinnedQueries.some(p => p.full === h.full)) { showToast("⚠️ Already pinned!", "warning"); return; }
    const updated = [h, ...pinnedQueries].slice(0, 5);
    setPinnedQueries(updated);
    try { localStorage.setItem("pinnedQueries", JSON.stringify(updated)); } catch (e) { console.warn(e); }
    showToast("📌 Pinned!");
  };

  const unpinQuery = (full) => {
    const updated = pinnedQueries.filter(p => p.full !== full);
    setPinnedQueries(updated);
    try { localStorage.setItem("pinnedQueries", JSON.stringify(updated)); } catch (e) { console.warn(e); }
  };

  // ── SORT + FILTER + PAGINATION ───────────────────────────────
  const handleSort = (col) => setSortConfig(prev => ({ key: col, direction: prev.key === col && prev.direction === "asc" ? "desc" : "asc" }));

  const getSortedFilteredData = useCallback(() => {
    let data = [...tableData];
    if (searchFilter.trim())
      data = data.filter(row => Object.values(row).some(v => String(v ?? "").toLowerCase().includes(searchFilter.toLowerCase())));
    if (sortConfig.key) {
      data.sort((a, b) => {
        const av = a[sortConfig.key], bv = b[sortConfig.key];
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === "number" && typeof bv === "number")
          return sortConfig.direction === "asc" ? av - bv : bv - av;
        return sortConfig.direction === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return data;
  }, [tableData, searchFilter, sortConfig]);

  const getPaginatedData = useCallback(() => {
    const data = getSortedFilteredData();
    return data.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
  }, [getSortedFilteredData, currentPage]);

  const totalPages = Math.max(1, Math.ceil(getSortedFilteredData().length / ROWS_PER_PAGE));

  // ── FORMAT QUERY ─────────────────────────────────────────────
  const formatQuery = () => {
    try {
      const formatted = format(query, { language: "mysql", tabWidth: 4, keywordCase: "upper", linesBetweenQueries: 2 });
      setQuery(formatted);
      setQueryTabs(prev => prev.map(t => t.id === activeQueryTab ? { ...t, query: formatted } : t));
      showToast("✨ Formatted!");
    } catch (e) {
      console.warn("Format error:", e);
    }
  };

  // ── INLINE EDIT ──────────────────────────────────────────────
  const startEdit = (rowIdx, colKey, value) => {
    setEditingCell({ rowIdx, colKey });
    setEditValue(String(value ?? ""));
  };

  const commitEdit = async (row, colKey) => {
    if (!activeTableName) { showToast("⚠️ Table unknown — run SELECT * FROM tablename first", "warning"); setEditingCell(null); return; }
    const pkColumn = Object.keys(row)[0];
    const pkValue = row[pkColumn];
    try {
      await axios.post(`${BACKEND_URL}/update-cell`, { table: activeTableName, column: colKey, value: editValue, pkColumn, pkValue });
      setTableData(prev => prev.map((r, i) => {
        const globalIdx = (currentPage - 1) * ROWS_PER_PAGE + (editingCell?.rowIdx ?? 0);
        return i === globalIdx ? { ...r, [colKey]: editValue } : r;
      }));
      showToast("✏️ Cell updated!");
    } catch (err) {
      showToast(`❌ ${err.response?.data?.error || "Update failed"}`, "error");
    }
    setEditingCell(null);
  };

  // ── AI ERROR SUGGESTION ──────────────────────────────────────
  const getAISuggestion = (msg) => {
    if (!msg) return null;
    if (msg.includes("syntax")) return "💡 AI Tip: Check for missing semicolons or keywords.";
    if (msg.includes("No database selected")) return "💡 AI Tip: Run 'USE database_name;' first.";
    if (msg.includes("doesn't exist")) return "💡 AI Tip: Check table name spelling or switch DB.";
    return "💡 AI Tip: Try running a simpler query to isolate the issue.";
  };

  // ── CELL COPY ────────────────────────────────────────────────
  const copyCell = (value, cellId) => {
    navigator.clipboard.writeText(String(value ?? "")).then(() => {
      setCopiedCell(cellId);
      setTimeout(() => setCopiedCell(null), 800);
      showToast("📋 Copied!");
    }).catch(() => {});
  };

  // ── CONNECT FORM ─────────────────────────────────────────────
  const handleConnect = async () => {
    setConnLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/connect`, connForm);
      showToast(`✅ ${res.data.message}`);
      setShowConnectModal(false);
      checkDb();
    } catch (err) {
      showToast(`❌ ${err.response?.data?.error || "Connection failed"}`, "error");
    }
    setConnLoading(false);
  };

  // ── RUN QUERY ────────────────────────────────────────────────
  const runQuery = useCallback(async (mode = "all") => {
    setLoading(true);
    setError(null);
    setFlowNodes([]);
    setCurrentPage(1);
    setMultiResultSets([]);
    const startTime = performance.now();
    let queryToExecute = query;

    if (mode === "selected" && editorRef.current) {
      const model = editorRef.current.getModel();
      const selection = editorRef.current.getSelection();
      const selected = model.getValueInRange(selection);
      if (selected && selected.trim()) {
        queryToExecute = selected;
      } else {
        showToast("⚠️ No text selected!", "warning");
        setLoading(false);
        return;
      }
    }

    // ✅ #39 — Cache check
    const cacheKey = queryToExecute.trim().toUpperCase();
    if (queryCache.current[cacheKey]) {
      const cached = queryCache.current[cacheKey];
      setTableData(cached.results);
      setRowCount(cached.results.length);
      generateChartData(cached.results);
      setActiveTab("table");
      setExecTime("cached");
      setLoading(false);
      showToast("⚡ From cache!");
      return;
    }

    try {
      const execRes = await axios.post(`${BACKEND_URL}/execute`, { query: queryToExecute });

      // ✅ #29 — Multiple result sets
      if (execRes.data.isMultiStatement && execRes.data.resultSets) {
        const selectSets = execRes.data.resultSets.filter(s => s.isSelect);
        setMultiResultSets(selectSets);
        setActiveResultSet(0);
        if (selectSets.length > 0) {
          setTableData(selectSets[0].results);
          setRowCount(selectSets[0].rowCount);
          generateChartData(selectSets[0].results);
          setActiveTab("table");
        }
        showToast(`✅ ${selectSets.length} result set(s)`);
      } else if (execRes.data.isSelect) {
        setTableData(execRes.data.results);
        setRowCount(execRes.data.results.length);
        generateChartData(execRes.data.results);
        setActiveTab("table");
        queryCache.current[cacheKey] = { results: execRes.data.results };

        // Extract table name for inline editing
        const m = queryToExecute.match(/FROM\s+`?(\w+)`?/i);
        if (m) setActiveTableName(m[1]);

        setHistory(prev => {
          if (prev.some(h => h.full === queryToExecute)) return prev;
          const entry = { query: queryToExecute.substring(0, 50) + "...", full: queryToExecute, time: new Date().toLocaleTimeString(), status: "success" };
          const updated = [entry, ...prev].slice(0, 15);
          try { localStorage.setItem("queryHistory", JSON.stringify(updated)); } catch (e) { console.warn(e); }
          return updated;
        });
        showToast(`✅ ${execRes.data.results.length} rows`);
      } else {
        setTableData([]);
        setError("✅ Command Executed Successfully");
        queryCache.current = {};
        showToast("✅ Executed!");
      }

      const analyzeRes = await axios.post(`${BACKEND_URL}/analyze`, { query: queryToExecute });
      generateFlowchart(analyzeRes.data.analysis);

      // ✅ #33 — Clear error markers on success
      if (editorRef.current && monacoRef.current) {
        monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), "sql", []);
      }

    } catch (err) {
      const msg = err.response?.data?.error || "Connection Failed";
      const tip = getAISuggestion(msg);
      setError(tip ? `❌ ${msg}\n\n${tip}` : `❌ ${msg}`);
      showToast(`❌ ${msg.substring(0, 50)}`, "error");

      // ✅ #33 — Mark error line in editor
      if (editorRef.current && monacoRef.current) {
        monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), "sql", [{
          startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 100,
          message: msg, severity: monacoRef.current.MarkerSeverity.Error,
        }]);
      }
    }

    setExecTime(((performance.now() - startTime) / 1000).toFixed(3));
    setLoading(false);
  }, [query, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ref in sync for keyboard shortcuts
  runQueryRef.current = runQuery;

  // ── SCHEMA ───────────────────────────────────────────────────
  const loadSchema = async () => {
    try {
      const [schemaRes, relRes] = await Promise.all([
        axios.post(`${BACKEND_URL}/schema`),
        axios.get(`${BACKEND_URL}/schema-relations`),
      ]);
      const nodes = schemaRes.data.schema.map((table, i) => ({
        id: `tbl-${table.name}`,
        position: { x: (i % 4) * 290, y: Math.floor(i / 4) * 260 },
        data: {
          label: (
            <div style={{ background: "#1e1e1e", color: "#fff", padding: "10px", border: "1px solid #007bff", borderRadius: "5px", minWidth: "160px" }}>
              <div style={{ color: "#007bff", fontWeight: "bold", marginBottom: "6px", borderBottom: "1px solid #333", paddingBottom: "4px" }}>📋 {table.name}</div>
              {table.columns.map(c => (
                <div key={c.Field} style={{ fontSize: "10px", padding: "1px 0", display: "flex", justifyContent: "space-between" }}>
                  <span>{c.Key === "PRI" ? "🔑 " : "🔹 "}{c.Field}</span>
                  <span style={{ color: "#888" }}>{c.Type}</span>
                </div>
              ))}
            </div>
          ),
        },
      }));
      // ✅ #25 — FK edges
      const edges = (relRes.data.relations || []).map((rel, i) => ({
        id: `fk-${i}`,
        source: `tbl-${rel.sourceTable}`,
        target: `tbl-${rel.targetTable}`,
        label: `${rel.sourceColumn} → ${rel.targetColumn}`,
        style: { stroke: "#007bff" },
        labelStyle: { fontSize: "9px", fill: "#888" },
        animated: true,
      }));
      setSchemaNodes(nodes);
      setSchemaEdges(edges);
      setActiveTab("schema");
      showToast(`🗂️ ${nodes.length} tables, ${edges.length} FK links`);
    } catch (e) {
      console.warn("Schema load error:", e);
      setError("Failed to load schema. Ensure a DB is selected.");
    }
  };

  // ── CHART / FLOWCHART ────────────────────────────────────────
  const generateChartData = (data) => {
    if (!data || !data.length) return setChartData(null);
    const keys = Object.keys(data[0]);
    const labelKey = keys.find(k => typeof data[0][k] === "string") || keys[0];
    const valueKey = keys.find(k => typeof data[0][k] === "number");
    if (labelKey && valueKey)
      setChartData({ labels: data.map(r => r[labelKey]), datasets: [{ label: valueKey.toUpperCase(), data: data.map(r => r[valueKey]), backgroundColor: "#007bff" }] });
    else setChartData(null);
  };

  const generateFlowchart = (analysis) => {
    const color = analysis.score === "F" ? "#ff4d4d" : "#4caf50";
    setFlowNodes([
      { id: "1", data: { label: "Start" }, position: { x: 250, y: 0 }, type: "input" },
      { id: "2", data: { label: "MySQL Engine" }, position: { x: 250, y: 70 } },
      { id: "3", data: { label: `Score: ${analysis.score}  Risk: ${analysis.risk}` }, style: { background: color, color: "#fff" }, position: { x: 250, y: 140 } },
      { id: "4", data: { label: analysis.suggestion }, style: { width: 300, fontSize: 12 }, position: { x: 250, y: 220 } },
    ]);
    setFlowEdges([
      { id: "e1", source: "1", target: "2" },
      { id: "e2", source: "2", target: "3" },
      { id: "e3", source: "3", target: "4" },
    ]);
  };

  const filteredHistory = history.filter(h => h.query.toLowerCase().includes(historySearch.toLowerCase()));

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="ide-container" style={{ background: darkMode ? "#1a1a1a" : "#f4f6f9", color: darkMode ? "#e8e8e8" : "#1a1d23", transition: "background 0.25s ease, color 0.25s ease" }}>

      <ToastContainer toasts={toasts} />

      {/* ── CONNECT MODAL (#28) ── */}
      {showConnectModal && (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, background: "rgba(0,0,0,0.72)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div style={{ background: darkMode ? "#242424" : "#fff", border: darkMode ? "1px solid #404040" : "1px solid #ddd", borderRadius: "12px", padding: "28px", width: "400px", maxWidth: "95vw", boxShadow: "0 12px 40px rgba(0,0,0,0.55)", animation: "scaleIn 0.2s ease" }}>
            <h3 style={{ margin: "0 0 20px", color: darkMode ? "#fff" : "#1a1d23", fontSize: "1.05rem" }}>🔌 Switch DB Connection</h3>
            {["host", "user", "password", "database", "port"].map(field => (
              <div key={field} style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "600", color: "#888", textTransform: "capitalize", letterSpacing: "0.06em", marginBottom: "4px" }}>{field}</label>
                <input
                  type={field === "password" ? "password" : "text"}
                  value={connForm[field]}
                  onChange={e => setConnForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={field === "port" ? "3306" : field}
                  style={{ width: "100%", boxSizing: "border-box", background: darkMode ? "#2a2a2a" : "#f5f5f5", border: darkMode ? "1px solid #404040" : "1px solid #ccc", color: darkMode ? "#e8e8e8" : "#1a1d23", borderRadius: "6px", padding: "8px 12px", fontSize: "0.87rem", outline: "none", fontFamily: "inherit" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button onClick={handleConnect} disabled={connLoading} style={{ flex: 1, padding: "9px", background: "#007bff", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600", fontFamily: "inherit", fontSize: "0.9rem", transition: "background 0.12s ease" }}>
                {connLoading ? "Connecting..." : "Connect"}
              </button>
              <button onClick={() => setShowConnectModal(false)} style={{ flex: 1, padding: "9px", background: "transparent", color: "#888", border: darkMode ? "1px solid #404040" : "1px solid #ccc", borderRadius: "6px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="header" style={{ background: darkMode ? "#252526" : "#ffffff", borderBottom: darkMode ? "1px solid #333" : "1px solid #ddd" }}>
        <h1>QueryLens <span>PRO</span></h1>

        <div className="db-badge" style={{ background: darkMode ? "#1a1a1a" : "#f0f0f0", borderColor: darkMode ? "#404040" : "#ddd" }}>
          🗄️ DB:{" "}
          <span style={{ color: currentDb === "Offline" ? "#ff4d4d" : "#28a745", fontWeight: "700" }}>{currentDb}</span>
          <button onClick={checkDb} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", padding: "0 2px" }} title="Refresh">🔄</button>
          <button onClick={() => setShowConnectModal(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#007bff", fontSize: "0.75rem", fontWeight: "600" }} title="Switch DB">🔌 Switch</button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button className="run-btn" onClick={() => runQuery("all")} disabled={loading} title="Run All (Ctrl+Enter)">
            {loading ? "⏳ Running..." : "⚡ Run All"}
          </button>
          <button className="run-btn" style={{ background: "linear-gradient(135deg, #007bff, #0056b3)", boxShadow: "0 2px 8px rgba(0,123,255,0.25)" }} onClick={() => runQuery("selected")} disabled={loading} title="Run Selected (Ctrl+Shift+Enter)">
            🖱️ Run Selected
          </button>
          <button onClick={formatQuery} style={{ background: "linear-gradient(135deg, #6f42c1, #563d7c)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "0.88rem", fontWeight: "600", fontFamily: "inherit" }} title="Format SQL">
            ✨ Format
          </button>
          <button onClick={saveBookmark} style={{ background: "linear-gradient(135deg, #fd7e14, #e55a00)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "0.88rem", fontWeight: "600", fontFamily: "inherit" }} title="Bookmark (Ctrl+S)">
            🔖 Save
          </button>
          <button onClick={() => setShowBookmarks(b => !b)} style={{ background: showBookmarks ? (darkMode ? "#3a3a3a" : "#e0e0e0") : "transparent", color: "#fd7e14", border: "1px solid #fd7e14", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", fontFamily: "inherit" }}>
            📚 {bookmarks.length}
          </button>
          <button onClick={() => setDarkMode(d => !d)} style={{ background: darkMode ? "#3a3a3a" : "#eef0f4", color: darkMode ? "#fff" : "#333", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease" }}>
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      {/* Bookmarks panel */}
      {showBookmarks && (
        <div style={{ background: darkMode ? "#2a2a2a" : "#f0f0f0", borderBottom: darkMode ? "1px solid #333" : "1px solid #ddd", padding: "8px 16px", display: "flex", gap: "8px", overflowX: "auto", alignItems: "center", flexWrap: "wrap", flexShrink: 0, animation: "slideDown 0.2s ease" }}>
          {bookmarks.length === 0
            ? <span style={{ color: "#666", fontSize: "0.84rem" }}>No bookmarks — press Ctrl+S to save!</span>
            : bookmarks.map(b => (
              <div key={b.id} style={{ background: darkMode ? "#333" : "#fff", border: "1px solid #fd7e14", borderRadius: "6px", padding: "4px 10px", fontSize: "0.79rem", display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
                <span onClick={() => setQuery(b.query)} style={{ color: "#fd7e14", fontWeight: "600", cursor: "pointer" }} title={b.query}>{b.name}</span>
                <span onClick={() => deleteBookmark(b.id)} style={{ color: "#666", cursor: "pointer", fontSize: "0.72rem" }}>✕</span>
              </div>
            ))
          }
        </div>
      )}

      {/* ✅ #30 — AI Suggestions bar */}
      {aiSuggestions.length > 0 && (
        <div style={{ background: darkMode ? "#1a2a1a" : "#f0fff4", borderBottom: darkMode ? "1px solid #2a4a2a" : "1px solid #b2dfdb", padding: "6px 16px", display: "flex", gap: "8px", overflowX: "auto", alignItems: "center", flexShrink: 0, animation: "slideDown 0.2s ease" }}>
          <span style={{ color: "#4caf50", fontSize: "0.74rem", fontWeight: "700", whiteSpace: "nowrap", flexShrink: 0 }}>💡 Suggestions:</span>
          {aiSuggestions.map((s, i) => (
            <button key={i} onClick={() => setQuery(s)} style={{ background: darkMode ? "#2a3a2a" : "#e8f5e9", color: darkMode ? "#4caf50" : "#2e7d32", border: "1px solid rgba(76,175,80,0.4)", borderRadius: "100px", padding: "3px 12px", fontSize: "0.74rem", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "monospace", transition: "all 0.12s ease" }}>
              {s.length > 55 ? s.substring(0, 55) + "…" : s}
            </button>
          ))}
        </div>
      )}

      {/* ── WORKSPACE ── */}
      <div className="workspace">

        {/* HISTORY SIDEBAR */}
        <div style={{ width: "210px", minWidth: "210px", background: darkMode ? "#242424" : "#f0f0f0", borderRight: darkMode ? "1px solid #333" : "1px solid #ddd", display: "flex", flexDirection: "column", overflow: "hidden", transition: "background 0.25s ease", flexShrink: 0 }}>

          {/* Pinned */}
          {pinnedQueries.length > 0 && (
            <div style={{ borderBottom: darkMode ? "1px solid #333" : "1px solid #ddd", flexShrink: 0 }}>
              <div style={{ padding: "7px 10px", fontSize: "0.7rem", fontWeight: "700", color: "#fd7e14", textTransform: "uppercase", letterSpacing: "0.07em" }}>📌 Pinned</div>
              {pinnedQueries.map((p, i) => (
                <div key={i} style={{ padding: "6px 10px", fontSize: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: darkMode ? "1px solid #2e2e2e" : "1px solid #e8e8e8" }}>
                  <span onClick={() => setQuery(p.full)} style={{ color: "#fd7e14", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "pointer" }} title={p.full}>{p.query}</span>
                  <span onClick={() => unpinQuery(p.full)} style={{ color: "#666", marginLeft: "6px", cursor: "pointer", flexShrink: 0, fontSize: "0.72rem" }}>✕</span>
                </div>
              ))}
            </div>
          )}

          {/* History search */}
          <div style={{ padding: "8px", flexShrink: 0 }}>
            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="🔍 Search history..."
              style={{ width: "100%", boxSizing: "border-box", background: darkMode ? "#2e2e2e" : "#fff", border: darkMode ? "1px solid #404040" : "1px solid #ccc", color: darkMode ? "#ccc" : "#333", borderRadius: "5px", padding: "5px 8px", fontSize: "0.75rem", outline: "none", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ padding: "4px 10px 7px", fontSize: "0.7rem", fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0 }}>🕒 History</div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredHistory.length === 0
              ? <div style={{ padding: "16px", color: "#555", fontSize: "0.8rem", textAlign: "center" }}>No history</div>
              : filteredHistory.map((h, i) => (
                <div key={i} style={{ padding: "8px 10px", borderBottom: darkMode ? "1px solid #2e2e2e" : "1px solid #eee", fontSize: "0.79rem", color: darkMode ? "#ccc" : "#333", display: "flex", justifyContent: "space-between", alignItems: "flex-start", transition: "background 0.1s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.background = darkMode ? "#2e2e2e" : "#e8e8e8"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <div onClick={() => setQuery(h.full)} style={{ flex: 1, cursor: "pointer", overflow: "hidden" }}>
                    <div style={{ color: "#007bff", fontWeight: "600", fontSize: "0.7rem", marginBottom: "2px" }}>{h.time}</div>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.query}</div>
                  </div>
                  <span onClick={() => pinQuery(h)} title="Pin" style={{ color: "#555", cursor: "pointer", padding: "2px 4px", fontSize: "0.75rem", flexShrink: 0 }}>📌</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* ── EDITOR PANE ── */}
        <div className="editor-pane" style={{ width: `${editorWidth}%`, minWidth: "200px" }}>

          {/* Query tabs */}
          <div style={{ display: "flex", background: darkMode ? "#252526" : "#f0f0f0", borderBottom: darkMode ? "1px solid #333" : "1px solid #ddd", overflowX: "auto", alignItems: "center", flexShrink: 0 }}>
            {queryTabs.map(tab => (
              <div key={tab.id} onClick={() => switchQueryTab(tab)} style={{ padding: "8px 16px", cursor: "pointer", background: activeQueryTab === tab.id ? (darkMode ? "#1a1a1a" : "#fff") : "transparent", borderTop: activeQueryTab === tab.id ? "2px solid #007bff" : "2px solid transparent", color: activeQueryTab === tab.id ? (darkMode ? "#fff" : "#1a1d23") : "#777", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.83rem", whiteSpace: "nowrap", transition: "all 0.15s ease" }}>
                📄 {tab.title}
                {queryTabs.length > 1 && (
                  <span onClick={e => { e.stopPropagation(); closeQueryTab(tab.id); }} style={{ color: "#666", fontWeight: "bold", fontSize: "0.72rem", padding: "0 3px", borderRadius: "3px", transition: "color 0.1s ease" }}>✕</span>
                )}
              </div>
            ))}
            <div onClick={addQueryTab} style={{ padding: "8px 12px", cursor: "pointer", color: "#007bff", fontSize: "1.2rem", fontWeight: "bold", transition: "background 0.12s ease" }} title="New Tab">+</div>
          </div>

          {/* ✅ #40 — Lazy Monaco */}
          <Suspense fallback={<div className="editor-loading">Loading editor...</div>}>
            <Editor
              height="90%"
              defaultLanguage="sql"
              theme={darkMode ? "vs-dark" : "light"}
              value={query}
              onChange={setQuery}
              options={{ minimap: { enabled: false }, fontSize: 14, quickSuggestions: true, suggestOnTriggerCharacters: true, wordBasedSuggestions: true, snippetSuggestions: "on", tabCompletion: "on" }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco; // ✅ FIX: use ref, not window.monaco

                monaco.languages.registerCompletionItemProvider("sql", {
                  provideCompletionItems: () => {
                    const kw = ["SELECT","FROM","WHERE","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","DROP","ALTER","ADD","COLUMN","INDEX","PRIMARY","KEY","FOREIGN","REFERENCES","JOIN","INNER","LEFT","RIGHT","OUTER","FULL","CROSS","ON","GROUP","BY","ORDER","HAVING","LIMIT","OFFSET","DISTINCT","COUNT","SUM","AVG","MAX","MIN","AS","AND","OR","NOT","IN","LIKE","BETWEEN","IS","NULL","TRUE","FALSE","CASE","WHEN","THEN","ELSE","END","UNION","ALL","EXISTS","TRUNCATE","DESCRIBE","SHOW","TABLES","DATABASES","USE","DATABASE","VARCHAR","INT","BIGINT","FLOAT","DECIMAL","DATE","DATETIME","TIMESTAMP","BOOLEAN","TEXT","BLOB","AUTO_INCREMENT","DEFAULT","UNIQUE","CONSTRAINT","IF","EXPLAIN","FORMAT","PROCEDURE","FUNCTION","TRIGGER","VIEW","COMMIT","ROLLBACK","BEGIN","TRANSACTION"];
                    return { suggestions: kw.map(k => ({ label: k, kind: monaco.languages.CompletionItemKind.Keyword, insertText: k, detail: "SQL Keyword", sortText: "0" + k })) };
                  }
                });
              }}
            />
          </Suspense>
        </div>

        {/* Resize handle — editor/results */}
        <div style={resizerStyle} onMouseDown={e => startResize("editor", e, editorWidth)} title="Drag to resize" />

        {/* ── RESULTS PANE ── */}
        <div className="results-pane" style={{ width: `${resultsWidth}%`, minWidth: "200px", background: darkMode ? "#1a1a1a" : "#fff" }}>

          {/* Exec time bar */}
          {execTime && (
            <div style={{ padding: "5px 12px", fontSize: "0.74rem", background: darkMode ? "#242424" : "#f5f5f5", borderBottom: darkMode ? "1px solid #333" : "1px solid #ddd", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", flexShrink: 0 }}>
              <span style={{ color: execTime === "cached" ? "#007bff" : parseFloat(execTime) < 1 ? "#28a745" : parseFloat(execTime) < 3 ? "#ff9800" : "#ff4d4d" }}>
                ⚡ {execTime === "cached" ? "Cached" : `${execTime}s`}
                {execTime !== "cached" && (parseFloat(execTime) < 1 ? " ● Fast" : parseFloat(execTime) < 3 ? " ● Moderate" : " ● Slow")}
              </span>
              {rowCount !== null && (
                <span style={{ color: darkMode ? "#888" : "#555" }}>
                  📋 <strong style={{ color: "#007bff" }}>{rowCount}</strong> rows
                  {rowCount === 1000 && <span style={{ color: "#ff9800" }}> ⚠️ Limit reached</span>}
                </span>
              )}
              {activeTableName && <span style={{ color: "#555", fontSize: "0.7rem" }}>📌 {activeTableName}</span>}
            </div>
          )}

          {/* ✅ #29 — Multi result set tabs */}
          {multiResultSets.length > 1 && (
            <div style={{ display: "flex", gap: "6px", padding: "5px 10px", background: darkMode ? "#1a1a2e" : "#e8eaf6", borderBottom: darkMode ? "1px solid #333" : "1px solid #c5cae9", overflowX: "auto", flexShrink: 0 }}>
              <span style={{ color: "#888", fontSize: "0.74rem", alignSelf: "center", flexShrink: 0 }}>Sets:</span>
              {multiResultSets.map((s, i) => (
                <button key={i} onClick={() => { setActiveResultSet(i); setTableData(s.results); setRowCount(s.rowCount); generateChartData(s.results); }}
                  style={{ padding: "3px 12px", fontSize: "0.74rem", fontWeight: "600", borderRadius: "4px", border: "none", cursor: "pointer", fontFamily: "inherit", background: activeResultSet === i ? "#007bff" : (darkMode ? "#2e2e2e" : "#fff"), color: activeResultSet === i ? "#fff" : (darkMode ? "#ccc" : "#333"), transition: "all 0.12s ease" }}>
                  Set {i + 1} ({s.rowCount} rows)
                </button>
              ))}
            </div>
          )}

          {/* Tab bar */}
          <div className="tabs" style={{ background: darkMode ? "#242424" : "#f5f5f5" }}>
            <button className={activeTab === "table" ? "active" : ""} onClick={() => setActiveTab("table")}>📊 Data</button>
            <button className={activeTab === "chart" ? "active" : ""} onClick={() => setActiveTab("chart")}>📈 Visuals</button>
            <button className={activeTab === "explain" ? "active" : ""} onClick={() => setActiveTab("explain")}>⚡ Perf</button>
            <button className={activeTab === "schema" ? "active" : ""} onClick={loadSchema}>🗂️ Schema</button>

            {(activeTab === "table" || activeTab === "chart") && (
              <div style={{ display: "flex", gap: "4px", marginLeft: "auto", marginRight: "8px", alignItems: "center" }}>
                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ padding: "3px 7px" }}>➖</button>
                <span style={{ color: "#666", fontSize: "0.78rem", minWidth: "36px", textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(3.0, z + 0.1))} style={{ padding: "3px 7px" }}>➕</button>
              </div>
            )}

            {activeTab === "table" && tableData.length > 0 && (
              <div style={{ display: "flex", gap: "5px" }}>
                <button onClick={downloadCSV} className="csv-btn">📥 CSV</button>
                <button onClick={downloadExcel} style={{ background: "rgba(33,115,70,0.1)", color: "#28a745", border: "1px solid rgba(40,167,69,0.4)", borderRadius: "5px", padding: "4px 12px", fontSize: "0.74rem", cursor: "pointer", fontWeight: "600", fontFamily: "inherit" }}>📊 Excel</button>
              </div>
            )}
          </div>

          {/* Filter bar */}
          {activeTab === "table" && tableData.length > 0 && (
            <div style={{ padding: "6px 10px", background: darkMode ? "#242424" : "#fafafa", borderBottom: darkMode ? "1px solid #333" : "1px solid #eee", flexShrink: 0 }}>
              <input value={searchFilter} onChange={e => { setSearchFilter(e.target.value); setCurrentPage(1); }} placeholder="🔍 Filter results by any value..."
                style={{ width: "100%", boxSizing: "border-box", background: darkMode ? "#2e2e2e" : "#fff", border: darkMode ? "1px solid #404040" : "1px solid #ddd", color: darkMode ? "#ccc" : "#333", borderRadius: "5px", padding: "5px 10px", fontSize: "0.8rem", outline: "none", fontFamily: "inherit" }} />
            </div>
          )}

          <div className="tab-content">
            {error && <div className="error-banner">{error}</div>}

            {/* DATA TABLE */}
            {activeTab === "table" && (
              <div className="table-wrapper">
                {tableData.length > 0 ? (
                  <>
                    <div style={{ overflow: "auto", flex: 1 }}>
                      <table style={{ fontSize: `${zoom}rem` }}>
                        <thead>
                          <tr>
                            {Object.keys(tableData[0]).map(k => (
                              <th key={k} onClick={() => handleSort(k)} style={{ background: sortConfig.key === k ? (darkMode ? "#333" : "#dde3ed") : (darkMode ? "#242424" : "#f0f3f7"), color: sortConfig.key === k ? "#007bff" : "" }}>
                                {k}{sortConfig.key === k ? (sortConfig.direction === "asc" ? " ▲" : " ▼") : " ↕"}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {getPaginatedData().map((r, rowIdx) => (
                            <tr key={rowIdx}>
                              {Object.entries(r).map(([k, v], colIdx) => {
                                const cellId = `${rowIdx}-${colIdx}`;
                                const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colKey === k;
                                return (
                                  <td key={colIdx}
                                    onClick={() => !isEditing && copyCell(v, cellId)}
                                    onDoubleClick={() => startEdit(rowIdx, k, v)}
                                    title="Click to copy · Double-click to edit"
                                    style={{ cursor: "pointer", background: copiedCell === cellId ? (darkMode ? "#1e3a1e" : "#e8f5e9") : isEditing ? (darkMode ? "#1a2e1a" : "#f0fff4") : "", outline: isEditing ? "2px solid #4caf50" : "none", transition: "background 0.2s ease", padding: isEditing ? "0" : undefined }}
                                  >
                                    {isEditing ? (
                                      <input autoFocus value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onBlur={() => commitEdit(r, k)}
                                        onKeyDown={e => { if (e.key === "Enter") commitEdit(r, k); if (e.key === "Escape") setEditingCell(null); }}
                                        style={{ width: "100%", minWidth: "80px", background: "transparent", border: "none", color: darkMode ? "#fff" : "#000", padding: "7px 14px", outline: "none", fontSize: "inherit", fontFamily: "inherit" }}
                                      />
                                    ) : (
                                      typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "")
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination currentPage={currentPage} totalPages={totalPages} rowCount={getSortedFilteredData().length} onPageChange={setCurrentPage} darkMode={darkMode} />
                  </>
                ) : (
                  <EmptyState icon="🗄️" title="No Data Yet" subtitle="Run a SELECT query to see results here" />
                )}
              </div>
            )}

            {activeTab === "chart" && (
              chartData
                ? <div className="chart-wrapper"><div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, minHeight: "400px", minWidth: "100%" }}><Bar data={chartData} options={{ maintainAspectRatio: false, responsive: true }} /></div></div>
                : <EmptyState icon="📈" title="No Chart Data" subtitle="Query must return at least one numeric column" />
            )}

            {activeTab === "explain" && (
              flowNodes.length
                ? <div className="flow-wrapper"><ReactFlow nodes={flowNodes} edges={flowEdges} fitView><Background /><Controls /></ReactFlow></div>
                : <EmptyState icon="⚡" title="No Analysis Yet" subtitle="Run a SELECT query to analyze performance" />
            )}

            {activeTab === "schema" && (
              schemaNodes.length
                ? <div className="flow-wrapper"><ReactFlow nodes={schemaNodes} edges={schemaEdges} fitView><Background /><Controls /></ReactFlow></div>
                : <EmptyState icon="🗂️" title="Schema Viewer" subtitle="Click Schema tab to load tables + FK relationships" />
            )}
          </div>
        </div>

        {/* Right resize handle */}
        <div style={resizerStyle} onMouseDown={e => startResize("results", e, resultsWidth)} title="Drag to resize" />
      </div>
    </div>
  );
}

export default App;