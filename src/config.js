// src/config.js

// ✅ Environment detect
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === "development";

// ✅ Base API (local dev server OR direct GAS)
export const API_BASE_URL = isDev
  ? "http://localhost:5050" // local proxy
  : "https://script.google.com/macros/s/AKfycbxr7jL8N31CnpqtpdvtslaRxPGOHZs5OJS4jWzhHMB9pQatIj-HLs24-lDYHja4jR6wFA/exec"; // GAS prod URL

// ✅ Endpoints
export const ENTRIES_URL = isDev
  ? `${API_BASE_URL}/entries` // local proxy
  : API_BASE_URL; // direct GAS (GET entries)

export const SAVE_URL = isDev
  ? `${API_BASE_URL}/save` // local proxy
  : API_BASE_URL; // direct GAS (POST save)

export const UPDATE_STATUS_URL = isDev
  ? `${API_BASE_URL}/update-status` // local proxy
  : API_BASE_URL; // direct GAS (POST with action param)

export const UPDATE_RESOLUTION_URL = isDev
  ? `${API_BASE_URL}/update-resolution` // local proxy
  : API_BASE_URL; // direct GAS (POST with action=updateResolution)

// ✅ Today Count Endpoint (different in prod)
export const TODAY_COUNT_URL = isDev
  ? `${API_BASE_URL}/today-count` // local proxy
  : `${API_BASE_URL}?action=todayCount`; // GAS requires query param

// ✅ Export all together
const config = {
  isDev,
  API_BASE_URL,
  ENTRIES_URL,
  SAVE_URL,
  UPDATE_STATUS_URL,
  UPDATE_RESOLUTION_URL, // 👈 अब यह भी include कर दिया
  TODAY_COUNT_URL,
};

export default config;
