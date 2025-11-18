import React, { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import "./TodayVehicle.css";

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
  const CAPTURE_INTERVAL_MS = 1200; // base delay between detections (tunable)
  const SIGMOID_ALPHA = 8.0; // preprocessing contrast
  const MIN_TOKEN_LEN = 3;
  const MAX_ENTRIES = 500;

  // Busy / RAF refs to avoid overlapping work
  const captureBusyRef = useRef(false);
  const rafIdRef = useRef(null);

  useEffect(() => {
    loadTodayEntries();
    initWorker();
    return () => {
      stopCamera();
      stopDetect();
      if (worker && typeof worker.terminate === "function") {
        try {
          worker.terminate();
        } catch (e) {
          console.warn("Worker terminate failed:", e);
        }
      }
    };
    // eslint-disable-next-line
  }, []);

  // Initialize Tesseract worker (improved)
  const initWorker = async () => {
    setStatus("Loading OCR worker...");
    try {
      const w = createWorker();
      await w.load();
      await w.loadLanguage("eng");
      await w.initialize("eng");
      await w.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -",
        preserve_interword_spaces: "1",
        // default to single-line; we may try other PSMs later per-variant if needed
        tessedit_pageseg_mode: "7",
      });
      setWorker(w);
      setStatus("OCR ready");
    } catch (err) {
      console.error("Worker init error", err);
      setStatus("OCR worker failed");
      alert("OCR worker initialization failed. Check console for details.");
    }
  };

  const loadTodayEntries = () => {
    try {
      const raw = localStorage.getItem("plate_entries_today");
      const arr = raw ? JSON.parse(raw) : [];
      setTodayList(arr);
    } catch (e) {
      console.warn("Failed loading entries:", e);
      setTodayList([]);
    }
  };

  // Camera controls
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser does not support camera access (getUserMedia). Use Chrome/Firefox.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
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
    try {
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (_) {}
        videoRef.current.srcObject = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    } catch (e) {
      console.warn("Error stopping camera:", e);
    }
    setStatus("Camera stopped");
  };

  // Sigmoid preprocessing: apply to imageData (modifies and returns)
  const applySigmoidToImageData = (imageData, alpha = SIGMOID_ALPHA) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0-255
      const x = (lum / 255) - 0.5;
      const y = 1 / (1 + Math.exp(-alpha * x));
      const out = Math.round(y * 255);
      d[i] = d[i + 1] = d[i + 2] = out;
    }
    return imageData;
  };

  // Otsu thresholding on grayscale imageData
  const applyOtsuThreshold = (imageData) => {
    const d = imageData.data;
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hist[lum]++;
    }
    const total = d.length / 4;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVar = 0;
    let threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        threshold = t;
      }
    }
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i];
      const val = lum > threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = val;
    }
    return imageData;
  };

  // Normalization & extraction helpers
  const normalizePlateToken = (t) => {
    if (!t) return "";
    let s = t.toUpperCase().replace(/[\s\-]/g, "");
    s = s
      .replace(/O/g, "0")
      .replace(/I/g, "1")
      .replace(/Z/g, "2")
      .replace(/S/g, "5")
      .replace(/B/g, "8");
    return s;
  };

  const PLATE_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$/;

  const extractPlateCandidates = (text) => {
    if (!text) return [];
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9\- \n]/g, " ");
    const tokens = cleaned.split(/[\s\n]+/).map(t => t.trim()).filter(Boolean);
    const normalized = tokens.map(normalizePlateToken).filter(Boolean);
    const strictMatches = normalized.filter(t => PLATE_RE.test(t));
    if (strictMatches.length) return Array.from(new Set(strictMatches));
    const candidates = normalized.filter(t => t.length >= MIN_TOKEN_LEN && /[0-9]/.test(t));
    return Array.from(new Set(candidates));
  };

  // small sleep helper
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Capture frame, preprocess multiple variants, OCR sequentially (serialized)
  const captureAndDetect = async () => {
    if (!videoRef.current || !worker) return;
    if (captureBusyRef.current) return;
    captureBusyRef.current = true;
    try {
      const video = videoRef.current;

      // Processing resolution (higher helps OCR for small text)
      const procW = 1200;
      const procH = Math.round((video.videoHeight / video.videoWidth) * procW) || 800;

      let canvas = procCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        procCanvasRef.current = canvas;
      }
      canvas.width = procW;
      canvas.height = procH;
      const ctx = canvas.getContext("2d");
      // draw current video frame
      ctx.drawImage(video, 0, 0, procW, procH);

      // ROI selection (center band) - slightly adjusted to catch plates lower/higher
      const roiX = Math.floor(procW * 0.10);
      const roiY = Math.floor(procH * 0.28);
      const roiW = Math.floor(procW * 0.80);
      const roiH = Math.floor(procH * 0.34);

      // get base ROI and upscale it for OCR
      const baseRoi = ctx.getImageData(roiX, roiY, roiW, roiH);
      const roiCanvas = document.createElement("canvas");
      const upscaleFactor = 2; // try 2x for better OCR; tune to 2 or 3
      roiCanvas.width = roiW * upscaleFactor;
      roiCanvas.height = roiH * upscaleFactor;
      const roiCtx = roiCanvas.getContext("2d");

      // put base ROI into temporary canvas then scale into roiCanvas
      const tmp = document.createElement("canvas");
      tmp.width = roiW;
      tmp.height = roiH;
      tmp.getContext("2d").putImageData(baseRoi, 0, 0);
      roiCtx.drawImage(tmp, 0, 0, roiCanvas.width, roiCanvas.height);

      // Build preprocessing variants (dataURLs)
      const variants = [];

      // Variant A: Sigmoid + Otsu (strong contrast + binarize)
      try {
        const imgData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
        applySigmoidToImageData(imgData, SIGMOID_ALPHA);
        applyOtsuThreshold(imgData);
        const c = document.createElement("canvas");
        c.width = roiCanvas.width; c.height = roiCanvas.height;
        c.getContext("2d").putImageData(imgData, 0, 0);
        variants.push(c.toDataURL("image/jpeg", 0.95));
      } catch (e) {
        console.warn("Variant A failed:", e);
      }

      // Variant B: Adaptive/block threshold (grayscale -> local threshold)
      try {
        const imgData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
        // convert to grayscale
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = lum;
        }
        // local/block thresholding
        const w = imgData.width, h = imgData.height;
        const block = Math.max(16, Math.floor(Math.min(w, h) / 16)); // adaptive block size
        const out = new Uint8ClampedArray(d.length);
        for (let by = 0; by < h; by += block) {
          for (let bx = 0; bx < w; bx += block) {
            let sum = 0, count = 0;
            for (let yy = by; yy < Math.min(h, by + block); yy++) {
              for (let xx = bx; xx < Math.min(w, bx + block); xx++) {
                const idx = (yy * w + xx) * 4;
                sum += imgData.data[idx];
                count++;
              }
            }
            const mean = sum / (count || 1);
            for (let yy = by; yy < Math.min(h, by + block); yy++) {
              for (let xx = bx; xx < Math.min(w, bx + block); xx++) {
                const idx = (yy * w + xx) * 4;
                const val = imgData.data[idx] > mean ? 255 : 0;
                out[idx] = out[idx + 1] = out[idx + 2] = val;
                out[idx + 3] = 255;
              }
            }
          }
        }
        const id = new ImageData(out, w, h);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").putImageData(id, 0, 0);
        variants.push(c.toDataURL("image/jpeg", 0.95));
      } catch (e) {
        console.warn("Variant B failed:", e);
      }

      // Variant C: Inverted + small dilation (helps white-on-dark or dark-on-white)
      try {
        const imgData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
        applySigmoidToImageData(imgData, SIGMOID_ALPHA);
        applyOtsuThreshold(imgData);
        const d = imgData.data;
        const w = imgData.width, h = imgData.height;
        // invert
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i];
          const inv = 255 - v;
          d[i] = d[i + 1] = d[i + 2] = inv;
        }
        // naive dilation
        const copy = new Uint8ClampedArray(d);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            let anyWhite = false;
            for (let yy = y - 1; yy <= y + 1; yy++) {
              for (let xx = x - 1; xx <= x + 1; xx++) {
                const n = (yy * w + xx) * 4;
                if (copy[n] > 200) { anyWhite = true; break; }
              }
              if (anyWhite) break;
            }
            const val = anyWhite ? 255 : 0;
            d[idx] = d[idx + 1] = d[idx + 2] = val;
          }
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").putImageData(imgData, 0, 0);
        variants.push(c.toDataURL("image/jpeg", 0.95));
      } catch (e) {
        console.warn("Variant C failed:", e);
      }

      // Variant D: original color upscale (fallback)
      try {
        variants.push(roiCanvas.toDataURL("image/jpeg", 0.9));
      } catch (e) {
        console.warn("Variant D failed:", e);
      }

      // Prepare storage array
      const ts = Date.now();
      const raw = localStorage.getItem("plate_entries_today");
      const arr = raw ? JSON.parse(raw) : [];

      // Run OCR sequentially on variants and pick best candidate
      setStatus("Running OCR variants...");
      let bestCandidates = [];

      for (const dataUrl of variants) {
        try {
          // small delay to reduce worker thrash
          await sleep(100);
          const { data } = await worker.recognize(dataUrl);
          const text = (data && data.text) ? data.text : "";
          const words = (data && data.words) ? data.words : [];
          // candidates from full text
          const candsFromText = extractPlateCandidates(text);
          for (const t of candsFromText) {
            bestCandidates.push({ plate: t, score: 40 }); // base score
          }
          // also use words with confidences
          for (const w of words) {
            if (!w || !w.text) continue;
            const norm = normalizePlateToken(w.text || "");
            const conf = w.confidence || 0;
            if (norm && norm.length >= MIN_TOKEN_LEN) {
              // larger plates get slight boost
              const lenBoost = Math.min(20, norm.length * 2);
              bestCandidates.push({ plate: norm, score: conf + lenBoost });
            }
          }
          // quick accept strict regex with decent score
          const strict = bestCandidates.find(x => PLATE_RE.test(x.plate) && x.score >= 40);
          if (strict) {
            const seenRecently = arr.some(e => e.plate === strict.plate && (ts - e.ts) < 30_000);
            if (!seenRecently) {
              arr.push({ plate: strict.plate, ts, image: dataUrl });
              localStorage.setItem("plate_entries_today", JSON.stringify(arr.slice(-MAX_ENTRIES)));
              setTodayList(arr.slice(-MAX_ENTRIES));
              setStatus(`Detected: ${strict.plate}`);
            } else {
              setStatus(`Detected (recent): ${strict.plate}`);
            }
            captureBusyRef.current = false;
            return;
          }
        } catch (err) {
          console.error("OCR variant error:", err);
        }
      }

      // If no strict match, pick highest scored candidate overall
      if (bestCandidates.length > 0) {
        // dedupe by plate and pick max score
        const map = new Map();
        for (const c of bestCandidates) {
          const p = c.plate;
          if (!map.has(p) || map.get(p) < c.score) map.set(p, c.score);
        }
        const list = Array.from(map.entries()).map(([plate, score]) => ({ plate, score }));
        list.sort((a, b) => b.score - a.score);
        const pick = list[0];
        if (pick && pick.score > 45 && pick.plate.length >= MIN_TOKEN_LEN) {
          const seenRecently = arr.some(e => e.plate === pick.plate && (ts - e.ts) < 30_000);
          if (!seenRecently) {
            // Use first variant image as snapshot if available
            const snapshot = variants.length ? variants[0] : null;
            arr.push({ plate: pick.plate, ts, image: snapshot });
            localStorage.setItem("plate_entries_today", JSON.stringify(arr.slice(-MAX_ENTRIES)));
            setTodayList(arr.slice(-MAX_ENTRIES));
            setStatus(`Detected (best): ${pick.plate}`);
          } else {
            setStatus(`Detected (recent best): ${pick.plate}`);
          }
        } else {
          setStatus("No confident plate found");
        }
      } else {
        setStatus("No plate found in frame");
      }
    } catch (err) {
      console.error("captureAndDetect error:", err);
      setStatus("Detect error: " + (err.message || err.name));
    } finally {
      captureBusyRef.current = false;
    }
  };

  // Detection loop using requestAnimationFrame and serialized captures
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
    setStatus("Detection started (loop)");
    const loop = async () => {
      try {
        await captureAndDetect();
      } catch (e) {
        console.warn("Loop capture failed:", e);
      }
      // Wait a bit (tunable) between attempts to avoid CPU hogging
      await sleep(CAPTURE_INTERVAL_MS);
      if (runningDetect) {
        rafIdRef.current = requestAnimationFrame(loop);
      }
    };
    rafIdRef.current = requestAnimationFrame(loop);
  };

  const stopDetect = () => {
    setRunningDetect(false);
    if (rafIdRef.current) {
      try {
        cancelAnimationFrame(rafIdRef.current);
      } catch (e) {
        // ignore
      }
      rafIdRef.current = null;
    }
    setStatus("Detection stopped");
  };

  const clearToday = () => {
    localStorage.removeItem("plate_entries_today");
    setTodayList([]);
    setStatus("Cleared today's entries");
  };

  return (
    <div className="tv-root">
      <h2 className="tv-title">🚗 Today Vehicles (Camera + Live Detect)</h2>

      <div className="tv-controls">
        <button onClick={startCamera} disabled={runningCamera}>Start Camera</button>
        <button onClick={stopCamera} disabled={!runningCamera}>Stop Camera</button>
        <button onClick={startDetect} disabled={!runningCamera || runningDetect}>Start Detect</button>
        <button onClick={stopDetect} disabled={!runningDetect}>Stop Detect</button>
        <button onClick={clearToday}>Clear Today</button>
      </div>

      <div className="tv-main">
        <div style={{ flex: 1 }}>
          <div className="tv-video-wrap">
            <video
              ref={videoRef}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              muted
              playsInline
              autoPlay
            />
          </div>
          <div className="tv-status" style={{ color: runningDetect ? "green" : "#666" }}>
            Status: {status}
          </div>
        </div>

        <div className="tv-side">
          <h4>
            Today's total: <span style={{ color: "green" }}>{todayList.length}</span>
          </h4>

          <div className="tv-list">
            {todayList.length === 0 ? (
              <div style={{ color: "#666" }}>No entries yet.</div>
            ) : (
              todayList
                .slice()
                .reverse()
                .map((it, idx) => (
                  <div key={idx} className="tv-card">
                    <div style={{ fontWeight: 700 }}>{it.plate}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{new Date(it.ts).toLocaleString()}</div>
                    <div style={{ marginTop: 8 }}>
                      {it.image ? (
                        <img
                          src={it.image}
                          alt="snap"
                          style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 4 }}
                        />
                      ) : null}
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
