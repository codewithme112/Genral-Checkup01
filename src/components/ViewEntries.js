// ViewEntries.js
import React, { useEffect, useState } from "react";
import PrintableEntry from "./PrintableEntry.js";
import { ENTRIES_URL, UPDATE_RESOLUTION_URL } from "../config.js";

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

const ViewEntries = () => {
  const [entries, setEntries] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [loading, setLoading] = useState(false);

  // ---------------- Fetch Entries ----------------
  const fetchEntries = async (queryUrl) => {
    try {
      setLoading(true);
      const res = await fetch(queryUrl);
      const data = await res.json();

      const fetchedEntries = Array.isArray(data)
        ? data
        : Array.isArray(data.entries)
        ? data.entries
        : [];

      setEntries(fetchedEntries);
    } catch (err) {
      console.error("❌ Fetch error:", err);
      alert("नेटवर्क समस्या! कृपया बाद में प्रयास करें।");
    } finally {
      setLoading(false);
    }
  };

  // Load only today's entries initially
  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    fetchEntries(`${ENTRIES_URL}?date=${yyyy}-${mm}-${dd}`);
  }, []);

  // ---------------- Search Handler ----------------
  const handleSearch = () => {
    if (searchText.trim()) {
      fetchEntries(
        `${ENTRIES_URL}?search=${encodeURIComponent(searchText.trim())}`
      );
    } else if (selectedDate) {
      // Send date directly in yyyy-mm-dd format as received from date input
      fetchEntries(`${ENTRIES_URL}?date=${selectedDate}`);
    } else {
      // Get today's date in yyyy-mm-dd format
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      fetchEntries(`${ENTRIES_URL}?date=${yyyy}-${mm}-${dd}`);
    }
  };

  // ---------------- Update Resolution ----------------
  const handleResolutionChange = async (entry, index, value, isOtherIssue = false) => {
    try {
      setLoading(true);
      const res = await fetch(UPDATE_RESOLUTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateResolution",
          registration: entry.registration,
          itemIndex: isOtherIssue ? 'other' : index + 1, // 'other' for other issues, 1-based index for checklist items
          resolution: value,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Resolution update हो गया!");
        // Local state भी update कर दें
        setEntries((prev) =>
          prev.map((e) =>
            e.registration === entry.registration
              ? {
                  ...e,
                  ...(isOtherIssue
                    ? { otherIssueResolution: value }
                    : {
                        items: e.items.map((item, i) =>
                          i === index ? { ...item, resolution: value } : item
                        ),
                      }),
                }
              : e
          )
        );
      } else {
        alert("❌ Resolution update fail हुआ!");
      }
    } catch (err) {
      console.error("❌ Update error:", err);
      alert("❌ Network error while updating resolution.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Render Summary ----------------
  const renderSummary = (entry) => {
    if (!Array.isArray(entry.items)) {
      return <span style={{ color: "red" }}>❌ डेटा उपलब्ध नहीं</span>;
    }

    const notOk = entry.items
      .map((item, i) =>
        item?.status === "नहीं"
          ? {
              label: `${i + 1}. ${checklistLabels[i] || "अज्ञात चेक"} — ${
                item?.remark || ""
              }`,
              index: i,
              resolution: item.resolution || "",
            }
          : null
      )
      .filter(Boolean);

    // Handle other issues separately from checklist items
    if (entry.otherIssue && typeof entry.otherIssue === "string" && entry.otherIssue.trim() !== "ठीक है") {
      notOk.push({
        label: `अन्य समस्या — ${entry.otherIssue}`,
        isOtherIssue: true,
        resolution: entry.otherIssueResolution || ""
      });
    }

    return notOk.length === 0 ? (
      <span style={{ color: "green" }}>✅ All OK</span>
    ) : (
      <div style={{ color: "red" }}>
        {notOk.map((item, i) => (
          <div key={i} style={{ marginBottom: "5px" }}>
            ❌ {item.label}
            <br />
            <select
              value={item.resolution}
              onChange={(e) =>
                handleResolutionChange(entry, item.index, e.target.value, item.isOtherIssue)
              }
            >
              <option value="">-- Resolution चुनें --</option>
              <option value="सही किया">✅ सही किया</option>
              <option value="ग्राहक ने मना किया">❌ ग्राहक ने मना किया</option>
            </select>
          </div>
        ))}
        <div style={{ color: "black" }}>✅ Other All OK</div>
      </div>
    );
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
              <strong>स्थिति:</strong> {renderSummary(entry)}
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
