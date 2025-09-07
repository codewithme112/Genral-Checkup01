import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

const app = express();
app.use(express.json());

// ✅ CORS allowed origin (Frontend safe fallback)
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:3000", "http://localhost:5051"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(morgan("dev"));

// ✅ GAS URL from env (mandatory)
const GAS_URL = process.env.GAS_URL;
if (!GAS_URL) {
  console.error("❌ GAS_URL is not set in .env file!");
  process.exit(1);
}

// ---------------- Routes ----------------

// Health check
app.get("/health", (_, res) => {
  res.json({
    ok: true,
    GAS_URL,
    frontend: process.env.FRONTEND_URL || "http://localhost:3000",
  });
});

// ✅ Get today's count
app.get("/today-count", async (_req, res) => {
  try {
    const r = await fetch(`${GAS_URL}?action=todayCount`);
    const text = await r.text();

    try {
      res.json(JSON.parse(text));
    } catch {
      console.error("❌ Invalid JSON from GAS (/today-count):", text);
      res.status(502).json({ error: "Invalid JSON from GAS", raw: text });
    }
  } catch (err) {
    console.error("❌ Error in /today-count:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ Get entries (with query passthrough)
app.get("/entries", async (req, res) => {
  try {
    const qs = req.originalUrl.includes("?")
      ? req.originalUrl.split("?")[1]
      : "";
    const url = `${GAS_URL}${qs ? `?${qs}` : ""}`;

    const r = await fetch(url);
    const text = await r.text();

    try {
      res.json(JSON.parse(text));
    } catch {
      console.error("❌ Invalid JSON from GAS (/entries):", text);
      res.status(502).json({ error: "Invalid JSON from GAS", raw: text });
    }
  } catch (err) {
    console.error("❌ Error in /entries:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ Save form data
app.post("/save", async (req, res) => {
  console.log("➡️ Received from frontend:", req.body);
  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // ✅ fixed header
      body: JSON.stringify(req.body),
    });

    const text = await r.text();

    try {
      res.json(JSON.parse(text));
    } catch {
      console.error("❌ Invalid JSON from GAS (/save):", text);
      res.status(502).json({ error: "Invalid JSON from GAS", raw: text });
    }
  } catch (err) {
    console.error("❌ Error in /save:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ Update Resolution
app.post("/update-resolution", async (req, res) => {
  console.log("➡️ Resolution update request:", req.body);
  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateResolution",
        registration: req.body.registration,
        itemIndex: req.body.itemIndex,
        resolution: req.body.resolution,
      }),
    });

    const text = await r.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      console.error("❌ Invalid JSON from GAS (/update-resolution):", text);
      res.status(502).json({ error: "Invalid JSON from GAS", raw: text });
    }
  } catch (err) {
    console.error("❌ Error in /update-resolution:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------- Server start ----------------
const PORT = process.env.PORT || 5050;
app.listen(PORT, () =>
  console.log(`✅ Proxy running at http://localhost:${PORT}`)
);
