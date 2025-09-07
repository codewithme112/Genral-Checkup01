// === HELPERS ===
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isSameDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

// Get today's date at midnight based on spreadsheet timezone
function todayLocal_() {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const s = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  return new Date(`${s}T00:00:00`);
}

function parseChecklistItems(row, headers) {
  const items = [];
  for (let i = 1; i <= 23; i++) {
    const sIdx = headers.indexOf(`Item ${i} Status`);
    const rIdx = headers.indexOf(`Item ${i} Remark`);
    const resIdx = headers.indexOf(`Item ${i} Resolution`);
    if (sIdx !== -1 && rIdx !== -1) {
      items.push({
        status: row[sIdx] || "हाँ",
        remark: row[rIdx] || "ठीक है",
        resolution: resIdx !== -1 ? (row[resIdx] || "") : ""
      });
    }
  }
  return items;
}

// === UPDATE STATUS (GET) ===
function updateStatus_(e) {
  const reg = (e.parameter.registration || "").toString().trim();
  const cust = (e.parameter.customerDecision || "Pending").toString().trim();
  const status = (e.parameter.repairStatus || "Pending").toString().trim();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Sheet1");
  if (!sheet) return jsonResponse({ success: false, error: "Sheet1 not found" });

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const regCol = headers.indexOf("Reg. No.");
  const custCol = headers.indexOf("Customer Decision");
  const repCol = headers.indexOf("Repair Status");
  if (regCol === -1 || custCol === -1 || repCol === -1) {
    return jsonResponse({ success: false, error: "Required columns not found" });
  }

  let last = -1;
  for (let r = 1; r < values.length; r++) {
    const v = (values[r][regCol] || "").toString().trim();
    if (v === reg) last = r;
  }
  if (last === -1) return jsonResponse({ success: false, error: "Registration not found" });

  sheet.getRange(last + 1, custCol + 1).setValue(cust);
  sheet.getRange(last + 1, repCol + 1).setValue(status);

  return jsonResponse({ success: true, updatedRow: last + 1 });
}

// === GET ===
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Sheet1");
  if (!sheet) return jsonResponse({ success: false, error: "Sheet1 not found" });

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = values.slice(1);

  const colIndex = (name) => headers.indexOf(name);
  const dateTimeCol = colIndex("DateTime");
  const regCol = colIndex("Reg. No.");
  const custDecisionCol = colIndex("Customer Decision");
  const repairStatusCol = colIndex("Repair Status");
  const otherIssueCol = colIndex("Other Issue");
  const otherIssueResolutionCol = colIndex("Other Issue Resolution");

  // todayCount endpoint
  if (e.parameter.action === "todayCount") {
    const today = todayLocal_();
    let count = 0;
    rows.forEach(row => {
      let val = row[dateTimeCol];
      if (!(val instanceof Date)) {
        val = new Date(val);
      }
      if (val instanceof Date && !isNaN(val) && isSameDate(val, today)) count++;
    });
    return jsonResponse({ success: true, todayCount: count });
  }

  // updateStatus endpoint
  if (e.parameter.action === "updateStatus") {
    return updateStatus_(e);
  }

  let filtered = rows;

  // type=today
  if (e.parameter.type === "today") {
    const today = todayLocal_();
    filtered = filtered.filter(row => {
      let v = row[dateTimeCol];
      if (!(v instanceof Date)) {
        v = new Date(v);
      }
      return v instanceof Date && !isNaN(v) && isSameDate(v, today);
    });
  }

  // registration filter
  if (e.parameter.registration) {
    const reg = e.parameter.registration.toString().trim();
    filtered = filtered.filter(row => {
      const v = (row[regCol] || "").toString().trim();
      return v === reg;
    });
  }

  // date filter
  if (e.parameter.date) {
    const target = new Date(e.parameter.date);
    filtered = filtered.filter(row => {
      let v = row[dateTimeCol];
      if (!(v instanceof Date)) {
        v = new Date(v);
      }
      return v instanceof Date && !isNaN(v) && isSameDate(v, target);
    });
  }

  const entries = filtered.map(row => ({
    dateTime: row[dateTimeCol],
    registration: row[regCol],
    kilometers: row[headers.indexOf("Kilometers")],
    model: row[headers.indexOf("Model Number")],
    customerDecision: row[custDecisionCol],
    repairStatus: row[repairStatusCol],
    otherIssue: row[otherIssueCol] || "ठीक है",
    otherIssueResolution: row[otherIssueResolutionCol] || "",
    items: parseChecklistItems(row, headers)
  }));

  return jsonResponse({ success: true, entries });
}

// === POST (SAVE) ===
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Sheet1");
    if (!sheet) return jsonResponse({ success: false, error: "Sheet1 not found" });

    const headers = sheet.getDataRange().getValues()[0];
    const data = JSON.parse(e.postData.contents || "{}");

    // Handle resolution update
    if (data.action === "updateResolution") {
      const reg = (data.registration || "").toString().trim();
      const itemIndex = data.itemIndex;
      const resolution = (data.resolution || "").toString().trim();

      if (!reg) {
        return jsonResponse({ success: false, error: "Registration is required" });
      }

      const values = sheet.getDataRange().getValues();
      const regCol = headers.indexOf("Reg. No.");
      let lastRow = -1;

      // Find the last row with matching registration
      for (let r = 1; r < values.length; r++) {
        const v = (values[r][regCol] || "").toString().trim();
        if (v === reg) lastRow = r;
      }

      if (lastRow === -1) {
        return jsonResponse({ success: false, error: "Registration not found" });
      }

      // Handle other issue resolution
      if (itemIndex === 'other') {
        const otherIssueResolutionCol = headers.indexOf("Other Issue Resolution");
        if (otherIssueResolutionCol === -1) {
          return jsonResponse({ success: false, error: "Other Issue Resolution column not found" });
        }
        sheet.getRange(lastRow + 1, otherIssueResolutionCol + 1).setValue(resolution);
      } else {
        // Handle checklist item resolution
        const itemIndexNum = parseInt(itemIndex, 10);
        if (isNaN(itemIndexNum) || itemIndexNum < 1 || itemIndexNum > 23) {
          return jsonResponse({ success: false, error: "Invalid item index" });
        }
        const resolutionCol = headers.indexOf(`Item ${itemIndexNum} Resolution`);
        if (resolutionCol === -1) {
          return jsonResponse({ success: false, error: "Resolution column not found" });
        }
        sheet.getRange(lastRow + 1, resolutionCol + 1).setValue(resolution);
      }

      return jsonResponse({ success: true, updatedRow: lastRow + 1 });
    }

    // Handle normal form submission
    const rowObj = {};
    rowObj["DateTime"] = new Date();
    rowObj["Reg. No."] = data.registration || "";
    rowObj["Kilometers"] = data.kilometers || "";
    rowObj["Model Number"] = data.model || "";
    rowObj["Other Issue"] = (data.otherIssue && data.otherIssue.trim()) ? data.otherIssue : "ठीक है";
    rowObj["Other Issue Resolution"] = "";
    rowObj["Customer Decision"] = "";
    rowObj["Repair Status"] = "";

    for (let i = 1; i <= 23; i++) {
      const item = Array.isArray(data.items) ? (data.items[i - 1] || {}) : {};
      rowObj[`Item ${i} Status`] = (item.status != null && item.status !== "") ? item.status : "हाँ";
      rowObj[`Item ${i} Remark`] = (item.remark && item.remark.trim()) ? item.remark : "ठीक है";
      rowObj[`Item ${i} Resolution`] = "";
    }

    const newRow = headers.map(h => rowObj.hasOwnProperty(h) ? rowObj[h] : "");
    sheet.appendRow(newRow);

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}