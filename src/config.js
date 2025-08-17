const env = "PROD"; // "DEV"
const GAS_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbwy-Gc6KAqtwiaxe5O17rqU6baNZ2xV_nXozZGxKNScinNFHBbQIf7qEYFcvfKZTIRu8g/exec";

export const ENTRIES_URL = env === "DEV" ? "http://localhost:5050/entries" : `${GAS_URL}?type=today`;
export const SAVE_URL = env === "DEV" ? "http://localhost:5050/save" : `${GAS_URL}?action=save`;
export const TODAY_COUNT_URL = env === "DEV" ? "http://localhost:5050/today-count" : `${GAS_URL}?action=todayCount`;
