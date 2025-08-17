import { TODAY_COUNT_URL } from '../config.js';

export async function fetchTodayCount() {
  try {
const response = await fetch(TODAY_COUNT_URL);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (typeof data.todayCount === "number") {
      return data.todayCount;
    }

    if (Array.isArray(data.entries)) {
      return data.entries.length;
    }

    if (Array.isArray(data)) {
      return data.length;
    }

    return 0;
  } catch (e) {
    console.error("Failed to fetch today's count:", e);
    return 0;
  }
}
