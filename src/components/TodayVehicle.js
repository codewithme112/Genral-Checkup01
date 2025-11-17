import React, { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";

const TodayVehicle = () => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const procCanvasRef = useRef(null);

  const [runningCamera, setRunningCamera] = useState(false);
  const [runningDetect, setRunningDetect] = useState(false);
  const [todayList, setTodayList] = useState([]);
  const [status, setStatus] = useState("idle");
  const [worker, setWorker] = useState(null);

  // Config
  const CAPTURE_INTERVAL_MS = 1200; // frame interval for detection
  const SIGMOID_ALPHA = 8.0; // higher -> stronger contrast
  const MIN_TOKEN_LEN = 3;
  const MAX_EXAMPLES = 5;

  useEffect(() => {
    loadTodayEntries();
    initWorker();
    return () => {
      stopCamera();
      stopDetect();
      if (worker) worker.terminate();
    };
    // eslint-disable-next-line
  }, []);

  // Initialize Tesseract worker
 const initWorker = async () => {
  setStatus("Loading OCR worker...");
  try {
    // NOTE: Do NOT pass a function (logger) here — it causes DataCloneError in the worker.
    const w = createWorker(); // simple, no logger passed
    await w.load();
    await w.loadLanguage("eng");
    await w.initialize("eng");
    await w.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -" });
    setWorker(w);
    setStatus("OCR ready");
  } catch (err) {
    console.error("Worker init error", err);
    setStatus("OCR worker failed");
  }
};


  const loadTodayEntries = () => {
    const raw = localStorage.getItem("plate_entries_today");
    const arr = raw ? JSON.parse(raw) : [];
    setTodayList(arr);
  };

  // Camera controls
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser does not support camera access (getUserMedia). Use Chrome/Firefox.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunningCamera(true);
      setStatus("Camera running");
    } catch (err) {
      console.error("Camera start error:", err);
      setStatus("Camera error: " + (err.message || err.name));
      alert("Camera error: " + (err.message || err.name));
    }
  };

  const stopCamera = () => {
    setRunningCamera(false);
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (_) {}
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStatus("Camera stopped");
  };

  // Sigmoid preprocessing: apply to imageData (modifies and returns)
  const applySigmoidToImageData = (imageData, alpha = SIGMOID_ALPHA) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      // luminance
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0-255
      // normalize to -0.5..0.5 then scale a bit
      const x = (lum / 255) - 0.5;
      const y = 1 / (1 + Math.exp(-alpha * x)); // sigmoid
      const out = Math.round(y * 255);
      d[i] = d[i + 1] = d[i + 2] = out;
    }
    return imageData;
  };

  // Extract candidate plate-like tokens from OCR text
  const extractPlateCandidates = (text) => {
    if (!text) return [];
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9\- \n]/g, " ");
    const tokens = cleaned.split(/[\s\n]+/).map(t => t.trim()).filter(Boolean);
    // heuristics: length >= MIN_TOKEN_LEN and contains a digit (plates have digits)
    const candidates = tokens.filter(t => t.length >= MIN_TOKEN_LEN && /[0-9]/.test(t));
    // dedupe
    return Array.from(new Set(candidates));
  };

  // Capture frame, preprocess, OCR
  const captureAndDetect = async () => {
    if (!videoRef.current || !worker) return;
    try {
      const video = videoRef.current;
      const w = 800; // processing width
      const h = Math.round((video.videoHeight / video.videoWidth) * w) || 600;
      let canvas = procCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        procCanvasRef.current = canvas;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);

      // Preprocess: sigmoid
      let imageData = ctx.getImageData(0, 0, w, h);
      imageData = applySigmoidToImageData(imageData, SIGMOID_ALPHA);
      ctx.putImageData(imageData, 0, 0);

      // optional: you could crop a center band to improve speed/accuracy
      // const crop = ctx.getImageData(x,y,cw,ch) ...

      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

      setStatus("Running OCR...");
      const { data: { text } } = await worker.recognize(dataUrl);
      setStatus("OCR done");
      const candidates = extractPlateCandidates(text);

      if (candidates.length > 0) {
        // log each candidate as an entry (if not duplicate recent)
        const ts = Date.now();
        const dataUri = dataUrl; // snapshot to save
        const raw = localStorage.getItem("plate_entries_today");
        const arr = raw ? JSON.parse(raw) : [];

        // For each candidate, check recent duplicates (last 30s) to avoid spam
        const recentWindow = 30_000;
        for (const plateText of candidates) {
          const seenRecently = arr.some(e => e.plate === plateText && (ts - e.ts) < recentWindow);
          if (!seenRecently) {
            arr.push({ plate: plateText, ts, image: dataUri });
            // keep only last N entries if you want
          }
        }
        // persist and update UI
        localStorage.setItem("plate_entries_today", JSON.stringify(arr.slice(-500))); // cap
        setTodayList(arr.slice(-500));
        setStatus(`Detected: ${candidates.join(", ")}`);
      } else {
        setStatus("No plate found in frame");
      }
    } catch (err) {
      console.error("detect err", err);
      setStatus("Detect error: " + (err.message || err.name));
    }
  };

  // Detection loop
  const detectLoopRef = useRef(null);
  const startDetect = () => {
    if (!runningCamera) {
      alert("Please start camera first");
      return;
    }
    if (!worker) {
      alert("OCR worker not ready yet");
      return;
    }
    if (runningDetect) return;
    setRunningDetect(true);
    setStatus("Detection started");
    detectLoopRef.current = setInterval(captureAndDetect, CAPTURE_INTERVAL_MS);
  };

  const stopDetect = () => {
    setRunningDetect(false);
    if (detectLoopRef.current) {
      clearInterval(detectLoopRef.current);
      detectLoopRef.current = null;
    }
    setStatus("Detection stopped");
  };

  const clearToday = () => {
    localStorage.removeItem("plate_entries_today");
    setTodayList([]);
    setStatus("Cleared today's entries");
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>🚗 Today Vehicles (Camera + Live Detect)</h2>

      <div style={{ margin: "10px 0" }}>
        <button onClick={startCamera} style={{ marginRight: 8, padding: "8px 12px" }}>Start Camera</button>
        <button onClick={stopCamera} style={{ marginRight: 8, padding: "8px 12px" }}>Stop Camera</button>

        <button onClick={startDetect} style={{ marginLeft: 16, marginRight: 8, padding: "8px 12px" }} disabled={!runningCamera}>Start Detect</button>
        <button onClick={stopDetect} style={{ marginRight: 8, padding: "8px 12px" }} disabled={!runningDetect}>Stop Detect</button>

        <button onClick={clearToday} style={{ marginLeft: 16, padding: "8px 12px" }}>Clear Today</button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ width: "100%", height: 420, background: "#000", borderRadius: 6, overflow: "hidden" }}>
            <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
          </div>
          <div style={{ marginTop: 8, color: runningDetect ? "green" : "#666" }}>
            Status: {status}
          </div>
        </div>

        <div style={{ width: 420 }}>
          <h4>Today's total: <span style={{ color: "green" }}>{todayList.length}</span></h4>

          <div style={{ marginTop: 8, maxHeight: 520, overflow: "auto" }}>
            {todayList.length === 0 ? (
              <div style={{ color: "#666" }}>No entries yet.</div>
            ) : (
              todayList.slice().reverse().map((it, idx) => (
                <div key={idx} style={{ padding: 8, border: "1px solid #ddd", marginBottom: 10, borderRadius: 6, background: "#fff" }}>
                  <div style={{ fontWeight: 700 }}>{it.plate}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{new Date(it.ts).toLocaleString()}</div>
                  <div style={{ marginTop: 8 }}>
                    <img src={it.image} alt="snap" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 4 }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {/* hidden processing canvas */}
      <canvas ref={procCanvasRef} style={{ display: "none" }} />
    </div>
  );
};

export default TodayVehicle;
