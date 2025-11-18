// src/components/TodayVehicle.js
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

  // Config / tuning
  const CAPTURE_INTERVAL_MS = 900; // base delay between detections (tune)
  const SIGMOID_ALPHA = 8.0; // preprocessing contrast
  const MIN_TOKEN_LEN = 3;
  const MAX_ENTRIES = 500;
  const DUPLICATE_WINDOW_MS = 4000; // 3–5s suppression
  const DEBUG = false;

  // busy / raf refs
  const captureBusyRef = useRef(false);
  const rafRef = useRef(null);

  useEffect(() => {
    loadTodayEntries();
    initWorker();
    return () => {
      stopDetect();
      stopCamera();
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

  // Initialize Tesseract worker
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
        tessedit_pageseg_mode: "7",
      });
      setWorker(w);
      setStatus("OCR ready");
    } catch (err) {
      console.error("Worker init error", err);
      setStatus("OCR worker failed");
      alert("OCR worker initialization failed. Check console.");
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
        audio: false,
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
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } catch (e) {
      console.warn("Error stopping camera:", e);
    }
    setStatus("Camera stopped");
  };

  // preprocessing helpers
  const applySigmoidToImageData = (imageData, alpha = SIGMOID_ALPHA) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const x = (lum / 255) - 0.5;
      const y = 1 / (1 + Math.exp(-alpha * x));
      const out = Math.round(y * 255);
      d[i] = d[i + 1] = d[i + 2] = out;
    }
    return imageData;
  };

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
    let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = t; }
    }
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i];
      const val = lum > threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = val;
    }
    return imageData;
  };

  // normalization and plate regex
  const normalizePlateToken = (t) => {
    if (!t) return "";
    let s = t.toUpperCase().replace(/[\s\-]/g, "");
    s = s.replace(/O/g, "0").replace(/I/g, "1").replace(/Z/g, "2").replace(/S/g, "5").replace(/B/g, "8");
    return s;
  };

  const PLATE_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$/;

  // Merge horizontally adjacent words into tokens
  const mergeWordsToTokens = (words, gapPx = 30) => {
    if (!Array.isArray(words) || words.length === 0) return [];
    const items = words
      .filter(w => w && w.text)
      .map(w => {
        const b = w.bbox || w.box || {};
        const x0 = b.x0 ?? b.left ?? 0;
        const x1 = b.x1 ?? b.right ?? (x0 + (w.text.length * 8));
        const conf = w.confidence ?? w.conf ?? 0;
        return { text: w.text, x0, x1, conf };
      })
      .sort((a, b) => a.x0 - b.x0);

    const tokens = [];
    let cur = null;
    for (const it of items) {
      if (!cur) {
        cur = { text: it.text, x0: it.x0, x1: it.x1, confs: [it.conf] };
        continue;
      }
      const gap = Math.max(0, it.x0 - cur.x1);
      if (gap <= gapPx) {
        cur.text += it.text;
        cur.x1 = Math.max(cur.x1, it.x1);
        cur.confs.push(it.conf);
      } else {
        const avg = cur.confs.reduce((a, b) => a + b, 0) / cur.confs.length;
        tokens.push({ text: cur.text, avgConf: avg });
        cur = { text: it.text, x0: it.x0, x1: it.x1, confs: [it.conf] };
      }
    }
    if (cur) {
      const avg = cur.confs.reduce((a, b) => a + b, 0) / cur.confs.length;
      tokens.push({ text: cur.text, avgConf: avg });
    }
    return tokens;
  };

  const extractPlateCandidatesFromText = (text) => {
    if (!text) return [];
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9\- \n]/g, " ");
    const tokens = cleaned.split(/[\s\n]+/).map(t => t.trim()).filter(Boolean);
    const normalized = tokens.map(normalizePlateToken).filter(Boolean);
    const strictMatches = normalized.filter(t => PLATE_RE.test(t));
    if (strictMatches.length) return Array.from(new Set(strictMatches));
    const candidates = normalized.filter(t => t.length >= MIN_TOKEN_LEN && /[0-9]/.test(t));
    return Array.from(new Set(candidates));
  };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Main capture & detect function
  const captureAndDetect = async () => {
    if (!videoRef.current || !worker) return;
    if (captureBusyRef.current) return;
    captureBusyRef.current = true;

    try {
      const video = videoRef.current;

      // Processing resolution + ROI + upscale
      const procW = 1600; // tune down to 1200 on slow devices
      const procH = Math.round((video.videoHeight / video.videoWidth) * procW) || 1000;

      let canvas = procCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        procCanvasRef.current = canvas;
      }
      canvas.width = procW;
      canvas.height = procH;
      const ctx = canvas.getContext("2d");

      // draw current frame at processing resolution
      try {
        ctx.drawImage(video, 0, 0, procW, procH);
      } catch (e) {
        // fallback to smaller draw if video not ready
        ctx.drawImage(video, 0, 0, Math.min(procW, 800), Math.min(procH, 600));
      }

      // ROI selection - focused band near typical plate area (tweak if needed)
      const roiX = Math.floor(procW * 0.08);
      const roiY = Math.floor(procH * 0.45);
      const roiW = Math.floor(procW * 0.84);
      const roiH = Math.floor(procH * 0.25);

      // get ROI and upscale
      const baseRoi = ctx.getImageData(roiX, roiY, roiW, roiH);
      const roiCanvas = document.createElement("canvas");
      const upscaleFactor = 3; // 3x for better OCR; reduce to 2 for performance
      roiCanvas.width = Math.max(1, Math.floor(roiW * upscaleFactor));
      roiCanvas.height = Math.max(1, Math.floor(roiH * upscaleFactor));
      const roiCtx = roiCanvas.getContext("2d");
      const tmp = document.createElement("canvas");
      tmp.width = roiW; tmp.height = roiH;
      tmp.getContext("2d").putImageData(baseRoi, 0, 0);
      roiCtx.drawImage(tmp, 0, 0, roiCanvas.width, roiCanvas.height);

      // Build preprocessing variants
      const variants = [];

      // Variant A: Sigmoid + Otsu
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

      // Variant B: Grayscale + adaptive/local threshold
      try {
        const imgData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = lum;
        }
        const w = imgData.width, h = imgData.height;
        const block = Math.max(16, Math.floor(Math.min(w, h) / 16));
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
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").putImageData(id, 0, 0);
        variants.push(c.toDataURL("image/jpeg", 0.95));
      } catch (e) {
        console.warn("Variant B failed:", e);
      }

      // Variant C: Sigmoid + Otsu + invert + small dilation
      try {
        const imgData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
        applySigmoidToImageData(imgData, SIGMOID_ALPHA);
        applyOtsuThreshold(imgData);
        const d = imgData.data; const w = imgData.width, h = imgData.height;
        for (let i = 0; i < d.length; i += 4) {
          const inv = 255 - d[i];
          d[i] = d[i + 1] = d[i + 2] = inv;
        }
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
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").putImageData(imgData, 0, 0);
        variants.push(c.toDataURL("image/jpeg", 0.95));
      } catch (e) {
        console.warn("Variant C failed:", e);
      }

      // Variant D: Color-boost for yellow plates (contrast stretch + boost)
      try {
        const imgData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
        const d = imgData.data;
        let minV = 255, maxV = 0;
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          if (lum < minV) minV = lum;
          if (lum > maxV) maxV = lum;
        }
        const range = Math.max(1, maxV - minV);
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          let v = Math.round(((lum - minV) * 255) / range);
          v = Math.max(0, Math.min(255, Math.round((v - 128) * 1.4 + 128)));
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        const c = document.createElement("canvas"); c.width = roiCanvas.width; c.height = roiCanvas.height;
        c.getContext("2d").putImageData(imgData, 0, 0);
        variants.push(c.toDataURL("image/jpeg", 0.95));
      } catch (e) {
        console.warn("Variant D failed:", e);
      }

      // Variant E: original color upscale fallback
      try {
        variants.push(roiCanvas.toDataURL("image/jpeg", 0.9));
      } catch (e) {
        console.warn("Variant E failed:", e);
      }

      // OCR per variant (serialized + multi-PSM fallback)
      setStatus("Running OCR variants...");
      const ts = Date.now();
      const raw = localStorage.getItem("plate_entries_today");
      const arr = raw ? JSON.parse(raw) : [];
      let bestCandidates = [];

      for (const vDataUrl of variants) {
        try {
          await sleep(100); // small throttle
          let ocrResult = null;
          // try psm 7 first
          try {
            await worker.setParameters({ tessedit_pageseg_mode: "7" });
            ocrResult = await worker.recognize(vDataUrl);
          } catch (e) {
            // ignore
          }
          // fallback psm 8
          if (!ocrResult || !ocrResult.data || !ocrResult.data.text || !ocrResult.data.text.trim()) {
            try {
              await worker.setParameters({ tessedit_pageseg_mode: "8" });
              ocrResult = await worker.recognize(vDataUrl);
            } catch (e) {
              // ignore
            }
          }
          const data = ocrResult ? ocrResult.data : {};
          const text = (data && data.text) ? data.text : "";
          const words = (data && data.words) ? data.words : [];

          // Merge words into tokens
          const mergedTokens = mergeWordsToTokens(words, 30);
          // Score tokens
          const scoreToken = (tok, baseConf = 40) => {
            const norm = normalizePlateToken(tok);
            if (!norm) return { plate: "", score: 0 };
            let score = Math.max(0, Math.min(100, baseConf || 40));
            const hasLetters = /[A-Z]/.test(norm);
            const hasDigits = /[0-9]/.test(norm);
            if (hasLetters && hasDigits) score += 20;
            if (PLATE_RE.test(norm)) score += 40;
            score += Math.min(20, Math.max(0, norm.length - 6) * 2);
            return { plate: norm, score };
          };

          for (const mt of mergedTokens) {
            const sc = scoreToken(mt.text, mt.avgConf || 40);
            if (sc.plate.length >= MIN_TOKEN_LEN) bestCandidates.push(sc);
          }
          const candsFromText = extractPlateCandidatesFromText(text);
          for (const t of candsFromText) {
            const sc = scoreToken(t, 40);
            if (sc.plate.length >= MIN_TOKEN_LEN) bestCandidates.push(sc);
          }

          if (DEBUG) {
            try { console.debug("OCR words:", words); console.debug("Candidates raw:", bestCandidates); } catch (_) {}
          }

          // quick accept strict high-score
          const strict = bestCandidates.find(x => PLATE_RE.test(x.plate) && x.score >= 60);
          if (strict) {
            const seenRecently = arr.some(e => e.plate === strict.plate && (ts - e.ts) < DUPLICATE_WINDOW_MS);
            if (!seenRecently) {
              arr.push({ plate: strict.plate, ts, image: vDataUrl });
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
      } // end variants loop

      // pick best overall if no strict match
      if (bestCandidates.length > 0) {
        const map = new Map();
        for (const c of bestCandidates) {
          const p = c.plate;
          if (!map.has(p) || map.get(p) < c.score) map.set(p, c.score);
        }
        const list = Array.from(map.entries()).map(([plate, score]) => ({ plate, score }));
        list.sort((a, b) => b.score - a.score);
        const pick = list[0];
        const alt = list.find(x => /[A-Z]/.test(x.plate) && /[0-9]/.test(x.plate));
        const chosen = (!pick ? null : (/[A-Z]/.test(pick.plate) && /[0-9]/.test(pick.plate)) ? pick : (alt && (pick.score - alt.score) <= 10 ? alt : pick));
        if (chosen && chosen.score >= 50 && chosen.plate.length >= MIN_TOKEN_LEN) {
          const seenRecently = arr.some(e => e.plate === chosen.plate && (ts - e.ts) < DUPLICATE_WINDOW_MS);
          if (!seenRecently) {
            const snapshot = variants.length ? variants[0] : null;
            arr.push({ plate: chosen.plate, ts, image: snapshot });
            localStorage.setItem("plate_entries_today", JSON.stringify(arr.slice(-MAX_ENTRIES)));
            setTodayList(arr.slice(-MAX_ENTRIES));
            setStatus(`Detected (best): ${chosen.plate}`);
          } else {
            setStatus(`Detected (recent best): ${chosen.plate}`);
          }
        } else {
          const top3 = list.slice(0, 3).map(x => `${x.plate}(${Math.round(x.score)})`).join(", ");
          setStatus(`No confident plate. Candidates: ${top3 || "-"}`);
          if (DEBUG) { try { console.debug("Candidates ranked:", list.slice(0, 10)); } catch (_) {} }
        }
      } else {
        setStatus("No plate found in frame");
      }

    } catch (err) {
      console.error("detect err", err);
      setStatus("Detect error: " + (err.message || err.name));
    } finally {
      captureBusyRef.current = false;
    }
  }; // end captureAndDetect

  // Detection loop using requestAnimationFrame + delay
  const startDetect = async () => {
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
    setStatus("Detection starting...");
    // small autofocus delay
    await sleep(600);
    setStatus("Detection started (loop)");
    const loop = async () => {
      try {
        await captureAndDetect();
      } catch (e) {
        console.warn("Loop capture failed:", e);
      }
      await sleep(CAPTURE_INTERVAL_MS);
      if (runningDetect) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopDetect = () => {
    setRunningDetect(false);
    if (rafRef.current) {
      try { cancelAnimationFrame(rafRef.current); } catch (_) {}
      rafRef.current = null;
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
            <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline autoPlay />
          </div>
          <div className="tv-status" style={{ color: runningDetect ? "green" : "#666" }}>
            Status: {status}
          </div>
        </div>

        <div className="tv-side">
          <h4>Today's total: <span style={{ color: "green" }}>{todayList.length}</span></h4>
          <div className="tv-list">
            {todayList.length === 0 ? (
              <div style={{ color: "#666" }}>No entries yet.</div>
            ) : (
              todayList.slice().reverse().map((it, idx) => (
                <div key={idx} className="tv-card">
                  <div style={{ fontWeight: 700 }}>{it.plate}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{new Date(it.ts).toLocaleString()}</div>
                  <div style={{ marginTop: 8 }}>
                    {it.image ? <img src={it.image} alt="snap" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 4 }} /> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <canvas ref={procCanvasRef} style={{ display: "none" }} />
    </div>
  );
};

export default TodayVehicle;
