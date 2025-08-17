import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import morgan from "morgan";

const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:3000" }));
app.use(morgan("dev"));

const GAS_URL =
  process.env.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyXx8XuwuLRaSA0yO2TZxyOnSuK5P8loxv6EhYVvXMn8lk0Uj64hezgx-2CVcyUmWzacA/exec";

app.get("/health", (_, res) => res.json({ ok: true }));

// Count only
app.get("/today-count", async (_req, res) => {
  try {
    const r = await fetch(`${GAS_URL}?action=todayCount`);
    const text = await r.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      res.status(502).json({ error: "Invalid JSON from GAS", raw: text });
    }
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Entries / filters / updateStatus passthrough
app.get("/entries", async (req, res) => {
  try {
    const qs = req.originalUrl.split("?")[1] || "";
    const url = `${GAS_URL}${qs ? `?${qs}` : ""}`;
    const r = await fetch(url);
    const text = await r.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      res.status(502).json({ error: "Invalid JSON from GAS", raw: text });
    }
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Save form (POST)
app.post("/save", async (req, res) => {
  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const text = await r.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      res.status(502).json({ error: "Invalid JSON from GAS", raw: text });
    }
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.listen(5050, () =>
  console.log("✅ Proxy running on http://localhost:5050")
);
