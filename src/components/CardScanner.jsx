/**
 * Webcam card scanner.
 *
 * Opens the user's camera, draws a card-outline overlay so they can
 * frame the card correctly, then captures a frame, crops to the card-
 * title strip at the top, runs Tesseract.js OCR, and fuzzy-matches
 * the result against the Scryfall autocomplete endpoint.
 *
 * Tesseract.js is lazy-imported on first scan so the ~2MB worker
 * payload doesn't hit the initial bundle. A single worker is reused
 * across the modal's lifetime.
 *
 * The card name strip occupies roughly the top 8-9% of a Magic card's
 * height, indented from the left for the mana cost. We crop a wider
 * band (top 12%) and let Tesseract focus inside that. The first OCR
 * pass is fed straight into Scryfall's autocomplete; the best match
 * is shown for the user to confirm or reject.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2, Check, RefreshCw, Plus, AlertCircle } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { searchCardAutocomplete, fetchCardByExactName, cardImageUrl } from '../lib/scryfall.js';
import { addToCollection } from '../lib/collection.js';

// Memoised tesseract worker, lazy-loaded on first scan.
let tesseractWorker = null;
let tesseractLoading = null;

async function getWorker(onProgress) {
  if (tesseractWorker) return tesseractWorker;
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = (async () => {
    onProgress?.('Loading scanner model... (~2MB, first time only)');
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('eng', undefined, {
      // Quiet the console — Tesseract is chatty about progress.
      logger: () => {},
    });
    // Tighten the character set to what appears in card names so
    // Tesseract doesn't waste guesses on glyphs that can't be card names.
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,'-./",
    });
    tesseractWorker = worker;
    tesseractLoading = null;
    return worker;
  })();
  return tesseractLoading;
}

export function CardScanner({ onClose, onAdded }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('starting'); // starting | ready | working | matched | error
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [rawOcr, setRawOcr] = useState('');
  const [candidate, setCandidate] = useState(null); // resolved Scryfall card
  const [suggestions, setSuggestions] = useState([]); // alt names
  const [recentlyAdded, setRecentlyAdded] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('ready');
      } catch (e) {
        setError(e.message || 'Camera access denied or unavailable.');
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setStatus('working');
    setProgress('');
    setError(null);
    setRawOcr('');
    setCandidate(null);
    setSuggestions([]);
    try {
      // Draw current video frame into the offscreen canvas, then crop
      // to the top 12% (card name strip).
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        setError('Camera not ready yet. Try again in a second.');
        setStatus('ready');
        return;
      }
      // Heuristic crop — assume the card fills most of the frame's
      // height. The name strip is in the top ~12% so we sample that
      // band with a margin to handle hand-shake.
      const cropY = 0;
      const cropH = Math.floor(h * 0.16);
      canvas.width = w;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, cropY, w, cropH, 0, 0, w, cropH);
      // Optional contrast boost. Simple grayscale + threshold.
      const img = ctx.getImageData(0, 0, w, cropH);
      const px = img.data;
      for (let i = 0; i < px.length; i += 4) {
        const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        const v = g > 140 ? 255 : g < 90 ? 0 : g;
        px[i] = px[i + 1] = px[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);

      const worker = await getWorker(setProgress);
      setProgress('Reading text...');
      const { data: { text } } = await worker.recognize(canvas);
      const cleaned = cleanOcr(text);
      setRawOcr(cleaned);
      if (!cleaned) {
        setError("Couldn't read the title. Move the card closer or improve lighting.");
        setStatus('ready');
        return;
      }
      setProgress('Matching against Scryfall...');
      const names = await searchCardAutocomplete(cleaned);
      if (!names || names.length === 0) {
        setError(`No matches for "${cleaned}". Try again or edit the name manually.`);
        setStatus('ready');
        return;
      }
      // Take the top candidate; keep the rest as alternatives.
      const best = await fetchCardByExactName(names[0]);
      setCandidate(best);
      setSuggestions(names.slice(1, 5));
      setStatus('matched');
    } catch (e) {
      setError(e.message || 'Scan failed.');
      setStatus('ready');
    } finally {
      setProgress('');
    }
  };

  const confirmAdd = async () => {
    if (!candidate) return;
    setStatus('working');
    setProgress(`Adding ${candidate.name} to collection...`);
    await addToCollection(candidate.name, 1);
    onAdded?.(candidate);
    setRecentlyAdded((r) => [{ name: candidate.name, image: cardImageUrl(candidate, 'small') }, ...r].slice(0, 5));
    setCandidate(null);
    setSuggestions([]);
    setRawOcr('');
    setProgress('');
    setStatus('ready');
  };

  const pickAlternative = async (name) => {
    setStatus('working');
    const card = await fetchCardByExactName(name);
    if (card) setCandidate(card);
    setStatus('matched');
  };

  const reset = () => {
    setCandidate(null);
    setSuggestions([]);
    setRawOcr('');
    setError(null);
    setStatus('ready');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,22,20,0.94)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-3xl max-h-[92vh] flex flex-col"
        style={{ background: BG, borderColor: CREAM_FAINT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-baseline justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM_DIM }}>
              <Camera className="w-3 h-3" /> Scan a card
            </div>
            <div className="font-serif text-lg font-black uppercase mt-1" style={{ color: CREAM }}>
              Webcam → Collection
            </div>
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Camera preview with framing guide */}
          <div className="relative border" style={{ borderColor: CREAM_FAINT, background: '#000' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full block"
              style={{ maxHeight: '50vh', objectFit: 'contain' }}
            />
            {/* Card-outline guide */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ padding: '6%' }}
            >
              <div
                className="border-2 relative"
                style={{
                  borderColor: 'rgba(243,231,201,0.65)',
                  aspectRatio: '5 / 7',
                  height: '85%',
                  borderRadius: '12px',
                }}
              >
                {/* title strip ghost */}
                <div
                  className="absolute left-2 right-2 top-2 border border-dashed"
                  style={{
                    borderColor: 'rgba(243,231,201,0.55)',
                    height: '12%',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>
            {/* hidden capture canvas */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
            Hold the card flat under good lighting, name strip filling the dashed box. Tap <span style={{ color: CREAM }}>Scan</span> to capture.
          </div>

          {status === 'working' && (
            <div className="flex items-center gap-2 font-mono text-xs" style={{ color: CREAM_DIM }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress || 'Working...'}
            </div>
          )}

          {error && (
            <div
              className="px-4 py-3 border flex items-start gap-2"
              style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: ACCENT }} />
              <div className="font-mono text-xs" style={{ color: CREAM }}>{error}</div>
            </div>
          )}

          {candidate && (
            <div className="border p-4 flex gap-4" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}>
              <img
                src={cardImageUrl(candidate, 'normal')}
                alt={candidate.name}
                className="w-24 sm:w-32 shrink-0"
                style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <div className="flex-1 min-w-0">
                <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold" style={{ color: CREAM_DIM }}>
                  Best match
                </div>
                <div className="font-serif font-black uppercase tracking-tight mt-1" style={{ color: CREAM, fontSize: '1.2rem' }}>
                  {candidate.name}
                </div>
                <div className="font-serif text-sm italic mt-1" style={{ color: CREAM_DIM }}>
                  {candidate.type_line}
                </div>
                {rawOcr && (
                  <div className="font-mono text-[10px] mt-2" style={{ color: CREAM_DIM }}>
                    Read: <span style={{ color: CREAM }}>{rawOcr}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={confirmAdd}
                    className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1.5 flex items-center gap-1.5"
                    style={{ borderColor: CREAM, color: CREAM, background: 'rgba(243,231,201,0.08)' }}
                  >
                    <Check className="w-3 h-3" /> Add to collection
                  </button>
                  <button
                    onClick={reset}
                    className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1.5 flex items-center gap-1.5"
                    style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
                  >
                    <RefreshCw className="w-3 h-3" /> Try again
                  </button>
                </div>
                {suggestions.length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: CREAM_FAINT }}>
                    <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold mb-1.5" style={{ color: CREAM_DIM }}>
                      Or did you mean
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((n) => (
                        <button
                          key={n}
                          onClick={() => pickAlternative(n)}
                          className="font-mono text-[10px] px-2 py-1 border"
                          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {recentlyAdded.length > 0 && (
            <div className="border-t pt-3" style={{ borderColor: CREAM_FAINT }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold mb-2" style={{ color: CREAM_DIM }}>
                Recently scanned ({recentlyAdded.length})
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {recentlyAdded.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 border px-2 py-1" style={{ borderColor: CREAM_FAINT }}>
                    {r.image && <img src={r.image} alt={r.name} className="w-5 h-7 object-cover" />}
                    <span className="font-mono text-[10px]" style={{ color: CREAM }}>{r.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-3" style={{ borderColor: CREAM_FAINT }}>
          <button
            onClick={onClose}
            className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100"
            style={{ color: CREAM_DIM }}
          >
            Done
          </button>
          <button
            onClick={capture}
            disabled={status !== 'ready'}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-5 py-2 disabled:opacity-30 flex items-center gap-1.5"
            style={{ borderColor: CREAM, color: CREAM, background: 'rgba(243,231,201,0.06)' }}
          >
            <Camera className="w-3 h-3" /> Scan
          </button>
        </div>
      </div>
    </div>
  );
}

function cleanOcr(text) {
  return (text || '')
    .split('\n')[0]
    .replace(/[^A-Za-z0-9 ,'\-./]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
