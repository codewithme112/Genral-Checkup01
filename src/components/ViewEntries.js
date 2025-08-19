// ViewEntries.js
import React, { useEffect, useState } from "react";
import PrintableEntry from "./PrintableEntry.js";
import { ENTRIES_URL, UPDATE_STATUS_URL } from "../config.js";

const checklistLabels = [
  "सर्विस हिस्ट्री देखें और ग्राहक को सुझाव दें",
  "गियर ऑयल स्तर जांचें",
  "इंजन ऑयल स्तर जांचें",
  "डिफरेंशियल ऑयल स्तर जांचें",
  "कूलेंट स्तर जांचें",
  "ब्रेक सेटिंग और ब्रेक लाइनर जांचें",
  "क्लच सेटिंग और क्लच पार्ट्स जांचें",
  "व्हील अलाइनमेंट के लिए सुझाव दें",
  "लैपटॉप जांच के लिए सुझाव दिया गया",
  "सभी एयर होसेस जांचें",
  "फ्यूल पाइप जांचें",
  "कूलंट पाइप जांचें",
  "एयर फिल्टर की स्थिति और इंडिकेटर जांचें",
  "इंजन माउंटिंग जांचें",
  "टैंक कैप और डीजल टैंक कैप जांचें",
  "स्टेरिंग ऑयल स्तर और लीक जांचें",
  "बैटरी वाटर, बल्ब, फ्यूज जांचें",
  "वाइपर ब्लेड जांचें",
  "यूरिया लेवल जांचें",
  "फैन बेल्ट जांचें",
  "एसी गैस रिफिलिंग",
  "रेट्रो जांचें",
  "लोड झेलने वाले जोइंट्स की ग्रेसिंग जांचें",
  "अन्य समस्या",
];

// Format helpers
const formatDate = (dateTimeStr) => {
  if (!dateTimeStr) return "";
  const d = new Date(dateTimeStr);
  return isNaN(d) ? dateTimeStr : d.toLocaleDateString("hi-IN");
};

const formatTime = (dateTimeStr) => {
  if (!dateTimeStr) return "";
  const d = new Date(dateTimeStr);
  return isNaN(d)
    ? dateTimeStr
    : d.toLocaleTimeString("hi-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
};

// Build today's date in dd-mm-yyyy
const getTodayDateString = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const ViewEntries = () => {
  const [entries, setEntries] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [customerDecisions, setCustomerDecisions] = useState({});
  const [repairStatuses, setRepairStatuses] = useState({});

  // ---------------- Fetch Entries ----------------
  const fetchEntries = async (queryUrl) => {
    try {
      setLoading(true);
      const res = await fetch(queryUrl);
      const data = await res.json();

      setEntries(
        Array.isArray(data)
          ? data
          : Array.isArray(data.entries)
          ? data.entries
          : []
      );
    } catch (err) {
      console.error("❌ Fetch error:", err);
      alert("नेटवर्क समस्या! कृपया बाद में प्रयास करें।");
    } finally {
      setLoading(false);
    }
  };

  // Load only today's entries initially
  useEffect(() => {
    fetchEntries(`${ENTRIES_URL}?date=${getTodayDateString()}`);
  }, []);

  // ---------------- Search Handler ----------------
  const handleSearch = () => {
    if (searchText.trim()) {
      fetchEntries(
        `${ENTRIES_URL}?search=${encodeURIComponent(searchText.trim())}`
      );
    } else if (selectedDate) {
      const [yyyy, mm, dd] = selectedDate.split("-");
      fetchEntries(`${ENTRIES_URL}?date=${dd}-${mm}-${yyyy}`);
    } else {
      fetchEntries(`${ENTRIES_URL}?date=${getTodayDateString()}`);
    }
  };

  // ---------------- Render Summary ----------------
  const renderSummary = (items, otherIssue) => {
    if (!Array.isArray(items)) {
      return <span style={{ color: "red" }}>❌ डेटा उपलब्ध नहीं</span>;
    }

    const notOk = items
      .map((item, i) =>
        item?.status === "नहीं"
          ? `${i + 1}. ${checklistLabels[i] || "अज्ञात चेक"} — ${
              item?.remark || ""
            }`
          : null
      )
      .filter(Boolean);

    // अन्य समस्या चेक
    if (otherIssue && typeof otherIssue === "string" && otherIssue.trim()) {
      if (otherIssue.trim() !== "ठीक है") {
        notOk.push(`23. अन्य समस्या — ${otherIssue}`);
      }
    }

    return notOk.length === 0 ? (
      <span style={{ color: "green" }}>✅ All OK</span>
    ) : (
      <div style={{ color: "red" }}>
        {notOk.map((item, i) => (
          <div key={i}>❌ {item}</div>
        ))}
        <div style={{ color: "black" }}>✅ Other All OK</div>
      </div>
    );
  };

  // ---------------- State Change Handlers ----------------
  const handleCustomerDecisionChange = (regNo, value) => {
    setCustomerDecisions((prev) => ({ ...prev, [regNo]: value }));
    if (value === "Denied") {
      setRepairStatuses((prev) => ({ ...prev, [regNo]: "Denied" }));
    } else if (value === "Pending") {
      setRepairStatuses((prev) => ({ ...prev, [regNo]: "Pending" }));
    }
  };

  const handleRepairStatusChange = (regNo, value) => {
    setRepairStatuses((prev) => ({ ...prev, [regNo]: value }));
  };

  // ---------------- Update Status ----------------
  const handleUpdateStatus = async (entry) => {
    const customerDecision = customerDecisions[entry.registration] || "Pending";
    const repairStatus = repairStatuses[entry.registration] || "Pending";

    try {
      setLoading(true);
      const res = await fetch(UPDATE_STATUS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          action: "updateStatus",
          registration: entry.registration,
          customerDecision,
          repairStatus,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Status updated successfully!");
        fetchEntries(`${ENTRIES_URL}?date=${getTodayDateString()}`);
      } else {
        alert("❌ Failed to update status.");
      }
    } catch (err) {
      console.error("❌ Update error:", err);
      alert("❌ Network error while updating.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- JSX ----------------
  return (
    <div className="entries-card-list">
      <h2 style={{ textAlign: "center" }}>📋 सभी चेकशीट एंट्री</h2>

      {loading && (
        <div className="loader-overlay">
          <div className="loader"></div>
        </div>
      )}

      {/* Search and Date filter */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
        <input
          type="text"
          placeholder="वाहन नंबर खोजें..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        <button onClick={handleSearch}>🔍 खोजें</button>
      </div>

      {/* Entries */}
      <div className="card-grid">
        {[...entries].reverse().map((entry, index) => (
          <div className="entry-card" key={index}>
            <div className="card-row"><strong>#{index + 1}</strong></div>
            <div className="card-row"><strong>वाहन नंबर:</strong> {entry.registration}</div>
            <div className="card-row"><strong>KM:</strong> {entry.kilometers}</div>
            <div className="card-row"><strong>मॉडल:</strong> {entry.model}</div>
            <div className="card-row"><strong>📅 तारीख:</strong> {formatDate(entry.dateTime)}</div>
            <div className="card-row"><strong>⏰ समय:</strong> {formatTime(entry.dateTime)}</div>

            <div className="card-row">
              <strong>स्थिति:</strong> {renderSummary(entry.items, entry.otherIssue)}
            </div>

            <div style={{ marginTop: "10px" }}>
              <label>Customer Decision: </label>
              <select
                value={customerDecisions[entry.registration] || "Pending"}
                onChange={(e) =>
                  handleCustomerDecisionChange(entry.registration, e.target.value)
                }
              >
                <option value="Pending">Pending</option>
                <option value="Accepted">Accepted</option>
                <option value="Denied">Denied</option>
              </select>
            </div>

            <div style={{ marginTop: "10px" }}>
              <label>Repair Status: </label>
              <select
                value={repairStatuses[entry.registration] || "Pending"}
                onChange={(e) =>
                  handleRepairStatusChange(entry.registration, e.target.value)
                }
                disabled={customerDecisions[entry.registration] !== "Accepted"}
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Done">Completed</option>
                <option value="Denied">Denied</option>
              </select>
            </div>

            <div style={{ marginTop: "10px" }}>
              <button
                onClick={() => handleUpdateStatus(entry)}
                style={{
                  background: "green",
                  color: "white",
                  padding: "5px 10px",
                  border: "none",
                  borderRadius: "5px",
                }}
              >
                ✅ Update Status
              </button>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
                marginTop: "10px",
              }}
            >
              <button onClick={() => setSelectedEntry(entry)}>📄 View Report</button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Print */}
      {selectedEntry && (
        <div className="overlay">
          <div className="modal">
            <button onClick={() => setSelectedEntry(null)}>❌ बंद करें</button>
            <div className="print-area">
              <PrintableEntry
                entry={selectedEntry}
                checklistLabels={checklistLabels}
              />
            </div>
            <button onClick={() => window.print()}>🖨️ प्रिंट</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewEntries;
