// src/config.js

// ✅ Environment detect
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === "development";

// ✅ Base API (local dev server OR direct GAS)
export const API_BASE_URL = isDev
  ? "http://localhost:5050" // local proxy
  : "https://script.google.com/macros/s/AKfycbyTXXdyOr_Nm4Zc_AZn26A_S4SEjQt93K5mv55FHmM84-qomDwQt1VflxAGW8bfoMse6Q/exec"; // GAS prod URL

// ✅ Endpoints
export const ENTRIES_URL = isDev
  ? `${API_BASE_URL}/entries` // local proxy
  : API_BASE_URL; // direct GAS

export const SAVE_URL = isDev
  ? `${API_BASE_URL}/save` // local proxy
  : API_BASE_URL; // direct GAS

export const UPDATE_STATUS_URL = isDev
  ? `${API_BASE_URL}/update-status` // local proxy
  : API_BASE_URL; // direct GAS

// ✅ Today Count Endpoint (different in prod)
export const TODAY_COUNT_URL = isDev
  ? `${API_BASE_URL}/today-count` // local proxy
  : `${API_BASE_URL}?action=todayCount`; // GAS requires query param

// ✅ Export all together (optional grouping)
const config = {
  isDev,
  API_BASE_URL,
  ENTRIES_URL,
  SAVE_URL,
  UPDATE_STATUS_URL,
  TODAY_COUNT_URL,
};

export default config;
