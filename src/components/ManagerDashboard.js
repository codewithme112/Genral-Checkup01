import React, { useEffect, useMemo, useState } from "react";
import { ENTRIES_URL } from "../config.js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const COLORS = ["#00C49F", "#FF8042", "#FFBB28", "#8884d8"];

const ManagerDashboard = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState({ from: "", to: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [selectedFailure, setSelectedFailure] = useState(null); // 👈 For bar click modal

  // -------- Fetch Data --------
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(ENTRIES_URL);
        const data = await res.json();
        const fetched = Array.isArray(data)
          ? data
          : Array.isArray(data.entries)
          ? data.entries
          : [];
        setEntries(fetched);
      } catch (err) {
        console.error("Fetch error:", err);
        alert("नेटवर्क समस्या!");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // -------- Filtered Entries --------
  const filteredEntries = useMemo(() => {
    let data = entries;

    // Date filter
    if (dateFilter.from || dateFilter.to) {
      const from = dateFilter.from ? new Date(dateFilter.from) : null;
      const to = dateFilter.to ? new Date(dateFilter.to) : null;
      data = data.filter((e) => {
        const d = new Date(e.dateTime);
        return (!from || d >= from) && (!to || d <= to);
      });
    }

    // Vehicle search
    if (searchTerm.trim()) {
      data = data.filter((e) =>
        e.registration.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return data;
  }, [entries, dateFilter, searchTerm]);

  // -------- Vehicle count map --------
  const vehicleCountMap = useMemo(() => {
    const map = {};
    filteredEntries.forEach((e) => {
      map[e.registration] = (map[e.registration] || 0) + 1;
    });
    return map;
  }, [filteredEntries]);

  // -------- Calculations --------
  const totalEntries = filteredEntries.length;
  const allOk = filteredEntries.filter(
    (e) =>
      Array.isArray(e.items) &&
      e.items.every((i) => i.status === "हाँ") &&
      (!e.otherIssue || e.otherIssue.trim() === "ठीक है")
  ).length;
  const problemFound = totalEntries - allOk;
  const resolved = filteredEntries.filter((e) =>
    Array.isArray(e.items)
      ? e.items.some((i) => i.resolution?.startsWith("सही किया"))
      : e.otherIssueResolution?.startsWith("सही किया")
  ).length;
  const denied = filteredEntries.filter((e) =>
    Array.isArray(e.items)
      ? e.items.some((i) => i.resolution === "ग्राहक ने मना किया")
      : e.otherIssueResolution === "ग्राहक ने मना किया"
  ).length;

  // -------- Pie Data --------
  const pieData = [
    { name: "All OK", value: allOk },
    { name: "Problem Found", value: problemFound },
    { name: "Resolved", value: resolved },
    { name: "Denied", value: denied },
  ];

  // -------- Checklist --------
  const checklistLabels = [
    "सर्विस हिस्ट्री","गियर ऑयल","इंजन ऑयल","डिफरेंशियल ऑयल","कूलेंट","ब्रेक","क्लच","अलाइनमेंट","लैपटॉप",
    "एयर होसेस","फ्यूल पाइप","कूलंट पाइप","एयर फिल्टर","इंजन माउंटिंग","टैंक कैप","स्टेरिंग ऑयल","बैटरी",
    "वाइपर","यूरिया","फैन बेल्ट","एसी गैस","रेट्रो","ग्रीसिंग"
  ];

  // -------- Failures for Bar Chart --------
  const failures = checklistLabels
    .map((label, i) => {
      const count = filteredEntries.filter(
        (e) => Array.isArray(e.items) && e.items[i]?.status === "नहीं"
      ).length;
      return { label, count };
    })
    .filter((f) => f.count > 0);

  // -------- Line chart: entries by date --------
  const dailyTrend = Object.values(
    filteredEntries.reduce((acc, e) => {
      const d = new Date(e.dateTime).toLocaleDateString("hi-IN");
      acc[d] = acc[d] || { date: d, count: 0 };
      acc[d].count++;
      return acc;
    }, {})
  );

  // -------- Export Excel --------
  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredEntries);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entries");
    const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    saveAs(
      new Blob([wbout], { type: "application/octet-stream" }),
      "ManagerDashboard.xlsx"
    );
  };

  // -------- Expand Row Handler --------
  const toggleExpand = (index) => {
    setExpanded((prev) => (prev === index ? null : index));
  };

  // -------- Get Vehicles for Selected Failure --------
  const getVehiclesForFailure = (failureLabel) => {
    const idx = checklistLabels.indexOf(failureLabel);
    return filteredEntries
      .filter((e) => Array.isArray(e.items) && e.items[idx]?.status === "नहीं")
      .map((e) => ({
        registration: e.registration,
        km: e.kilometers,
        model: e.model,
        dateTime: e.dateTime,
        remark: e.items[idx]?.remark,
        resolution: e.items[idx]?.resolution,
        otherIssue: e.otherIssue,
        otherIssueResolution: e.otherIssueResolution,
      }));
  };

  // -------- UI --------
  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ textAlign: "center" }}>📊 मैनेजर डैशबोर्ड</h2>
      {loading && <p style={{ textAlign: "center" }}>⏳ डेटा लोड हो रहा है...</p>}

      {/* Search + Date Filter */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "15px" }}>
        <input
          type="text"
          placeholder="वाहन नंबर खोजें..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: "6px", flex: 1, borderRadius: "6px", border: "1px solid #ccc" }}
        />
        <label>From:</label>
        <input type="date" onChange={(e) => setDateFilter((p) => ({ ...p, from: e.target.value }))} />
        <label>To:</label>
        <input type="date" onChange={(e) => setDateFilter((p) => ({ ...p, to: e.target.value }))} />
        <button onClick={exportExcel} style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "none",
          background: "#7187F0",
          color: "white",
          fontWeight: "bold",
          cursor: "pointer"
        }}>📤 Export Excel</button>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "10px",
          marginBottom: "25px",
        }}
      >
        <Card title="कुल Entries" value={totalEntries} color="#7187F0" />
        <Card title="All OK" value={allOk} color="#00C49F" />
        <Card title="Problem Found" value={problemFound} color="#FF8042" />
        <Card title="सही किया" value={resolved} color="#4CAF50" />
        <Card title="ग्राहक ने मना किया" value={denied} color="#E53935" />
      </div>

      {/* Charts */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        <ChartBox title="Overall Summary">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" outerRadius={100} label>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Daily Entry Trend">
          <ResponsiveContainer>
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Most Common Failures">
          <ResponsiveContainer>
            <BarChart data={failures}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval={0} angle={-45} textAnchor="end" height={130} />
              <YAxis />
              <Tooltip />
              <Bar
                dataKey="count"
                fill="#FF8042"
                onClick={(data) => setSelectedFailure(data.label)}
                cursor="pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {/* Modal / Vehicle List for Selected Failure */}
      {selectedFailure && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 9999
        }}>
          <div style={{ background: "white", width: "90%", maxHeight: "90%", overflowY: "auto", borderRadius: "10px", padding: "20px" }}>
            <h3>{selectedFailure} Failures</h3>
            <button onClick={() => setSelectedFailure(null)} style={{
              padding: "5px 10px", borderRadius: "6px", border: "none", background: "#7187F0", color: "white", cursor: "pointer", marginBottom: "10px"
            }}>Close</button>
            <table border="1" cellPadding="4" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#E3E7FF" }}>
                <tr>
                  <th>#</th>
                  <th>वाहन नंबर</th>
                  <th>KM</th>
                  <th>Model</th>
                  <th>Date</th>
                  <th>Remark</th>
                  <th>Resolution</th>
                  <th>Other Issue</th>
                  <th>Other Resolution</th>
                </tr>
              </thead>
              <tbody>
                {getVehiclesForFailure(selectedFailure).map((e, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{e.registration}</td>
                    <td>{e.km}</td>
                    <td>{e.model}</td>
                    <td>{new Date(e.dateTime).toLocaleString("hi-IN")}</td>
                    <td>{e.remark || "—"}</td>
                    <td>{e.resolution || "—"}</td>
                    <td>{e.otherIssue || "—"}</td>
                    <td>{e.otherIssueResolution || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Table */}
      <h3 style={{ marginTop: "40px" }}>📋 Detailed Entries</h3>
      <div style={{ overflowX: "auto", maxHeight: "500px" }}>
        <table border="1" cellPadding="4" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#E3E7FF", position: "sticky", top: 0 }}>
            <tr>
              <th>#</th>
              <th>वाहन नंबर</th>
              <th>KM</th>
              <th>मॉडल</th>
              <th>तारीख</th>
              <th>स्थिति</th>
              <th>Other Issue</th>
              <th>🔍 Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e, i) => {
              const isProblem =
                Array.isArray(e.items) &&
                e.items.some((it) => it.status === "नहीं");

              return (
                <React.Fragment key={i}>
                  <tr style={{ background: isProblem ? "#ffe8e8" : "#e8ffee" }}>
                    <td>{i + 1}</td>
                    <td>
                      {e.registration} {vehicleCountMap[e.registration] > 1 && `(${vehicleCountMap[e.registration]})`}
                    </td>
                    <td>{e.kilometers}</td>
                    <td>{e.model}</td>
                    <td>{new Date(e.dateTime).toLocaleString("hi-IN")}</td>
                    <td>{isProblem ? "Problem Found" : "All OK"}</td>
                    <td>{e.otherIssue || "—"}</td>
                    <td>
                      {isProblem ? (
                        <button
                          onClick={() => toggleExpand(i)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "none",
                            background: "#7187F0",
                            color: "white",
                            cursor: "pointer",
                            fontWeight: "bold",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                          }}
                        >
                          {expanded === i ? "Hide Details 🔼" : "View Details 🔽"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>

                  {/* Expandable Row */}
                  {expanded === i && (
                    <tr>
                      <td colSpan="8">
                        <div
                          style={{
                            background: "#f4f6fc",
                            padding: "15px",
                            borderRadius: "8px",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                          }}
                        >
                          <h4>❌ Problem Details:</h4>
                          {e.items
                            .map((item, idx) =>
                              item.status === "नहीं" ? (
                                <div key={idx} style={{ marginBottom: "8px" }}>
                                  <strong>{checklistLabels[idx]}</strong>
                                  <div>🗒️ Remark: {item.remark || "—"}</div>
                                  <div>🛠️ Resolution: {item.resolution || "—"}</div>
                                </div>
                              ) : null
                            )
                            .filter(Boolean)}
                          {e.otherIssue && e.otherIssue.trim() !== "ठीक है" && (
                            <div>
                              <strong>अन्य समस्या:</strong> {e.otherIssue}
                              <div>🛠️ Resolution: {e.otherIssueResolution || "—"}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------- Reusable Components ----------
const Card = ({ title, value, color }) => (
  <div
    style={{
      background: color,
      color: "white",
      padding: "15px",
      borderRadius: "10px",
      textAlign: "center",
      fontWeight: "bold",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    }}
  >
    <h4>{title}</h4>
    <p style={{ fontSize: "20px", margin: 0 }}>{value}</p>
  </div>
);

const ChartBox = ({ title, children }) => (
  <div
    style={{
      flex: 1,
      minWidth: "320px",
      height: "320px",
      padding: "10px",
      border: "1px solid #ccc",
      borderRadius: "10px",
      boxShadow: "0 1px 5px rgba(0,0,0,0.1)",
    }}
  >
    <h4 style={{ textAlign: "center" }}>{title}</h4>
    {children}
  </div>
);

export default ManagerDashboard;
