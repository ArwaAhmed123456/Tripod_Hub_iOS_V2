import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Plus,
  RefreshCw,
  Maximize2,
  Minimize2,
  Trash2,
  Edit2,
  Video,
  VideoOff,
  Grid,
  Layers,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Settings,
  Move,
} from 'lucide-react';
import Hls from 'hls.js';
import api from '../api';
import toast from 'react-hot-toast';

// ─── Detect iOS / iPadOS ──────────────────────────────────────────────────────
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isMobile = () => window.innerWidth < 768 || isIOS();

// ─── PTZ Control Overlay ─────────────────────────────────────────────────────
/**
 * Renders a D-pad + zoom strip + preset bar over the video.
 * Uses pointer events so it works with both mouse and touch.
 * Calls POST /api/cameras/:id/ptz with { action, direction, speed, preset }.
 */
const PTZControls = ({ cameraId, isAdmin }) => {
  const [ptzActive, setPtzActive] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [showPresets, setShowPresets] = useState(false);
  const activeDirection = useRef(null);
  const stopTimer = useRef(null);

  const sendPtz = useCallback(
    async (body) => {
      try {
        await api.post(`/cameras/${cameraId}/ptz`, body);
      } catch (err) {
        // Only show toast for non-stop commands to avoid noise
        if (body.action !== 'stop') {
          toast.error(err.response?.data?.error || 'PTZ command failed');
        }
      }
    },
    [cameraId]
  );

  const handlePtzStart = useCallback(
    (direction) => {
      if (activeDirection.current === direction) return;
      activeDirection.current = direction;
      sendPtz({ action: 'start', direction, speed });
    },
    [sendPtz, speed]
  );

  const handlePtzStop = useCallback(
    (direction) => {
      if (activeDirection.current !== direction && direction) return;
      activeDirection.current = null;
      clearTimeout(stopTimer.current);
      // Slight debounce: avoid stop/start flicker on fast taps
      stopTimer.current = setTimeout(() => {
        sendPtz({ action: 'stop', direction });
      }, 80);
    },
    [sendPtz]
  );

  // Clean up any active movement when the component unmounts or overlay closes
  useEffect(() => {
    return () => {
      if (activeDirection.current) {
        sendPtz({ action: 'stop', direction: activeDirection.current });
      }
    };
  }, [sendPtz]);

  // Generic button event binders for a direction
  const ptzBtn = (direction) => ({
    onPointerDown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); handlePtzStart(direction); },
    onPointerUp: () => handlePtzStop(direction),
    onPointerLeave: () => handlePtzStop(direction),
    onPointerCancel: () => handlePtzStop(direction),
    // Prevent iOS long-press context menu / text selection during hold
    onContextMenu: (e) => e.preventDefault(),
  });

  if (!ptzActive) {
    return (
      <button
        onClick={() => setPtzActive(true)}
        className="absolute bottom-14 right-3 p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white hover:bg-black/80 transition-colors touch-manipulation"
        title="Open PTZ Controls"
        aria-label="Open PTZ Controls"
      >
        <Move size={16} />
      </button>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-end justify-end pointer-events-none">
      {/* Speed + close bar — top of PTZ panel */}
      <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 mb-2 mr-2 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs">
        <span className="font-semibold text-white/60 uppercase tracking-wide">Speed</span>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="w-20 accent-blue-400"
          aria-label="PTZ speed"
        />
        <span className="w-4 text-center font-bold text-blue-300">{speed}</span>
        <button
          onClick={() => { setPtzActive(false); handlePtzStop(null); }}
          className="ml-1 p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          aria-label="Close PTZ controls"
        >
          <X size={13} />
        </button>
      </div>

      {/* Main panel: D-pad left, zoom right */}
      <div className="pointer-events-auto flex items-center gap-3 px-3 pb-3 mr-0">
        {/* D-Pad */}
        <div className="grid grid-cols-3 gap-1" style={{ width: 108 }}>
          {/* Row 1 */}
          <div />
          <PtzButton icon={<ChevronUp size={18} />} label="Up" {...ptzBtn('up')} />
          <div />
          {/* Row 2 */}
          <PtzButton icon={<ChevronLeft size={18} />} label="Left" {...ptzBtn('left')} />
          <PtzButton icon={<Crosshair size={16} />} label="Stop" onPointerDown={() => sendPtz({ action: 'stop' })} />
          <PtzButton icon={<ChevronRight size={18} />} label="Right" {...ptzBtn('right')} />
          {/* Row 3 */}
          <div />
          <PtzButton icon={<ChevronDown size={18} />} label="Down" {...ptzBtn('down')} />
          <div />
        </div>

        {/* Zoom strip */}
        <div className="flex flex-col gap-1">
          <PtzButton icon={<ZoomIn size={16} />} label="Zoom In" {...ptzBtn('zoom_in')} />
          <PtzButton icon={<ZoomOut size={16} />} label="Zoom Out" {...ptzBtn('zoom_out')} />
        </div>

        {/* Presets */}
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setShowPresets((p) => !p)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[10px] font-bold touch-manipulation"
            aria-label="Toggle presets"
          >
            P
          </button>
          {showPresets &&
            [1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onPointerDown={() => sendPtz({ action: 'goto_preset', preset: n })}
                onContextMenu={(e) => e.preventDefault()}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-blue-500/40 border border-white/20 text-white text-xs font-bold touch-manipulation transition-colors"
                aria-label={`Go to preset ${n}`}
              >
                {n}
              </button>
            ))}
          {showPresets && isAdmin && (
            <button
              onPointerDown={() => {
                const n = parseInt(window.prompt('Save to preset number (1–8):', '1'), 10);
                if (n >= 1 && n <= 8) sendPtz({ action: 'set_preset', preset: n });
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600/40 hover:bg-blue-600/60 border border-blue-400/30 text-white touch-manipulation"
              aria-label="Save current position as preset"
              title="Save preset"
            >
              <Settings size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Small reusable PTZ button
const PtzButton = ({ icon, label, ...events }) => (
  <button
    {...events}
    className="w-9 h-9 flex items-center justify-center rounded-xl bg-black/60 hover:bg-blue-600/70 active:bg-blue-600 border border-white/15 text-white transition-colors touch-manipulation select-none"
    aria-label={label}
    title={label}
  >
    {icon}
  </button>
);

// ─── Individual Camera Stream Tile ────────────────────────────────────────────
const CameraStreamTile = ({ camera, onEdit, onDelete, isAdmin }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);

  const [streamData, setStreamData] = useState(null);
  const [loadingStream, setLoadingStream] = useState(true);
  const [streamError, setStreamError] = useState(null);
  // Auto-select sub-stream on mobile/iOS to save bandwidth and avoid H.265 decode issues
  const [useSubstream, setUseSubstream] = useState(() => isMobile());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPtz, setShowPtz] = useState(false);

  // ── Fetch tokenised HLS session from backend ──────────────────────────────
  const fetchStreamSession = useCallback(async () => {
    setLoadingStream(true);
    setStreamError(null);
    try {
      const res = await api.post(`/cameras/${camera.id}/stream-session`);
      setStreamData(res.data.stream);
    } catch (err) {
      setStreamError(err.response?.data?.error || 'Failed to initialise stream session');
    } finally {
      setLoadingStream(false);
    }
  }, [camera.id]);

  useEffect(() => {
    fetchStreamSession();
  }, [fetchStreamSession]);

  // ── Attach HLS player to <video> ─────────────────────────────────────────
  useEffect(() => {
    if (!streamData) return;

    const streamUrl =
      useSubstream && streamData.low_res_hls_url
        ? streamData.low_res_hls_url
        : streamData.hls_url;

    if (!streamUrl || !videoRef.current) return;

    const video = videoRef.current;

    // Destroy any existing instance first
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      // ── Chrome / Firefox / Android via hls.js ──────────────────────────
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        // On slow mobile connections, prefer the lowest ABR level
        startLevel: isMobile() ? 0 : -1,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setStreamError('Live stream unavailable');
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // ── Safari / iOS — native HLS decoder ─────────────────────────────
      // iOS Safari supports HLS natively including LL-HLS and H.265 on
      // supported hardware (iPhone 12+ with iOS 16+).
      // The `playsInline` attribute (set on the element) is required so
      // the video doesn't fullscreen automatically on iOS.
      video.src = streamUrl;
      video.load();
      const onMeta = () => video.play().catch(() => {});
      video.addEventListener('loadedmetadata', onMeta, { once: true });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamData, useSubstream]);

  // ── Fullscreen — uses webkit API on iOS ───────────────────────────────────
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;

    // iOS Safari: requestFullscreen doesn't exist; use webkitEnterFullscreen
    // on the <video> element directly instead.
    if (isIOS()) {
      const v = videoRef.current;
      if (v && v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
      }
      return;
    }

    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Sync fullscreen state for non-iOS browsers
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const canUsePtz = camera.ptz_supported && camera.has_onvif;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-900 shadow-md overflow-hidden transition-all hover:shadow-lg group"
    >
      {/* ── Video area ── */}
      <div className="relative w-full bg-slate-950 flex items-center justify-center"
           style={{ aspectRatio: '16/9' }}>
        {/* playsInline is critical on iOS to prevent auto-fullscreen */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          autoPlay
          playsInline
          // iOS requires user interaction to play; muted autoplay is allowed
          webkit-playsinline="true"
        />

        {/* Loading overlay */}
        {loadingStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white gap-2">
            <RefreshCw className="animate-spin text-[#2b4594]" size={24} />
            <p className="text-xs text-slate-300">Connecting live stream…</p>
          </div>
        )}

        {/* Error overlay */}
        {streamError && !loadingStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white p-4 text-center">
            <VideoOff className="text-red-400 mb-2" size={28} />
            <p className="text-sm font-semibold text-slate-200">Camera Feed Inactive</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">{streamError}</p>
            <button
              onClick={fetchStreamSession}
              className="mt-3 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors touch-manipulation"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        {/* Live / Offline badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] font-semibold pointer-events-none">
          <span className={`w-2 h-2 rounded-full ${!streamError ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {!streamError ? 'LIVE' : 'OFFLINE'}
        </div>

        {/* Top-right quick actions — visible on hover or always on touch devices */}
        <div className={`absolute top-3 right-3 flex items-center gap-1.5 transition-opacity ${
          isMobile() ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {/* SD / HD toggle — only shown when a sub-stream exists */}
          {camera.has_substream && (
            <button
              onClick={() => setUseSubstream((s) => !s)}
              className="px-2 py-1 rounded-lg bg-black/60 text-white text-[11px] font-bold border border-white/10 hover:bg-black/80 touch-manipulation"
              title={useSubstream ? 'Switch to HD (main stream)' : 'Switch to SD sub-stream'}
            >
              {useSubstream ? 'HD' : 'SD'}
            </button>
          )}

          {/* PTZ toggle button */}
          {canUsePtz && (
            <button
              onClick={() => setShowPtz((p) => !p)}
              className={`p-1.5 rounded-lg border touch-manipulation transition-colors ${
                showPtz
                  ? 'bg-blue-600 border-blue-400 text-white'
                  : 'bg-black/60 border-white/10 text-white hover:bg-black/80'
              }`}
              title="Toggle PTZ Controls"
              aria-label="Toggle PTZ controls"
            >
              <Move size={14} />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-black/60 text-white border border-white/10 hover:bg-black/80 touch-manipulation"
            title="Toggle Fullscreen"
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {/* PTZ overlay — only rendered when toggled on and camera supports it */}
        {showPtz && canUsePtz && (
          <PTZControls cameraId={camera.id} isAdmin={isAdmin} />
        )}
      </div>

      {/* ── Tile footer ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-white text-slate-800 border-t border-slate-100">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-slate-900 leading-tight truncate">{camera.name}</h4>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{camera.location || 'Site Location'}</p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 ml-3 shrink-0">
            <button
              onClick={() => onEdit(camera)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-[#2b4594] hover:bg-blue-50 transition-colors touch-manipulation"
              title="Edit Camera Settings"
              aria-label="Edit camera"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => onDelete(camera)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors touch-manipulation"
              title="Delete Camera"
              aria-label="Delete camera"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Add / Edit Camera Modal ──────────────────────────────────────────────────
const CameraModal = ({ editingCamera, cameraForm, setCameraForm, onSave, onClose, saving }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
    {/* Sheet on mobile, centred dialog on desktop */}
    <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
      {/* Drag handle for mobile sheet */}
      <div className="flex justify-center pt-3 pb-1 sm:hidden">
        <div className="w-10 h-1 rounded-full bg-slate-200" />
      </div>

      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h3 className="text-lg font-bold text-slate-900">
          {editingCamera ? 'Edit Camera Feed' : 'Add New Camera Feed'}
        </h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 touch-manipulation"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={onSave} className="p-6 space-y-4">
        <Field label="Camera Name *">
          <input
            type="text"
            required
            placeholder="e.g. Main Gate Entrance"
            value={cameraForm.name}
            onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none focus:ring-2 focus:ring-[#2b4594]/20"
          />
        </Field>

        <Field label="Location / Zone">
          <input
            type="text"
            placeholder="e.g. Perimeter Fence / East Yard"
            value={cameraForm.location}
            onChange={(e) => setCameraForm({ ...cameraForm, location: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none focus:ring-2 focus:ring-[#2b4594]/20"
          />
        </Field>

        <Field label="Primary RTSP Stream URL *" hint="e.g. rtsp://admin:pass@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0">
          <input
            type="text"
            required={!editingCamera}
            placeholder={editingCamera ? '(Leave blank to keep existing)' : 'rtsp://admin:pass@ip:554/stream1'}
            value={cameraForm.rtsp_url}
            onChange={(e) => setCameraForm({ ...cameraForm, rtsp_url: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-xs focus:border-[#2b4594] focus:outline-none focus:ring-2 focus:ring-[#2b4594]/20"
          />
        </Field>

        <Field label="Sub-Stream RTSP URL (Mobile / Low-Res)" hint="Dahua: …?channel=1&subtype=1 — auto-selected on iOS/mobile">
          <input
            type="text"
            placeholder="rtsp://admin:pass@ip:554/cam/realmonitor?channel=1&subtype=1"
            value={cameraForm.sub_stream_rtsp_url}
            onChange={(e) => setCameraForm({ ...cameraForm, sub_stream_rtsp_url: e.target.value })}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-xs focus:border-[#2b4594] focus:outline-none focus:ring-2 focus:ring-[#2b4594]/20"
          />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <input
            type="checkbox"
            id="ptz_supported"
            checked={cameraForm.ptz_supported}
            onChange={(e) => setCameraForm({ ...cameraForm, ptz_supported: e.target.checked })}
            className="w-4 h-4 rounded text-[#2b4594] focus:ring-[#2b4594]"
          />
          <label htmlFor="ptz_supported" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
            Supports Pan-Tilt-Zoom (PTZ) controls
          </label>
        </div>

        {/* ONVIF / CGI host — only shown when PTZ is ticked */}
        {cameraForm.ptz_supported && (
          <Field
            label="Camera HTTP Host (for PTZ CGI)"
            hint="Display-only — e.g. 192.168.1.100. Credentials stay in the RTSP URL above."
          >
            <input
              type="text"
              placeholder="192.168.1.100"
              value={cameraForm.onvif_host}
              onChange={(e) => setCameraForm({ ...cameraForm, onvif_host: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-xs focus:border-[#2b4594] focus:outline-none focus:ring-2 focus:ring-[#2b4594]/20"
            />
          </Field>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#2b4594] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1e326e] disabled:opacity-60 shadow touch-manipulation"
          >
            {saving ? 'Saving…' : editingCamera ? 'Save Changes' : 'Connect Camera'}
          </button>
        </div>
      </form>
    </div>
  </div>
);

// Tiny form field wrapper
const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

// ─── Main Cameras Page ────────────────────────────────────────────────────────
const CamerasPage = () => {
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gridCols, setGridCols] = useState(() => (isMobile() ? 1 : 2));
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [cameraForm, setCameraForm] = useState({
    name: '',
    location: '',
    rtsp_url: '',
    sub_stream_rtsp_url: '',
    ptz_supported: false,
    onvif_host: '',
  });
  const [saving, setSaving] = useState(false);

  const adminRole = localStorage.getItem('adminRole') || '';
  const isAdmin = ['admin', 'superadmin'].includes(adminRole);

  // ── Fetch sites ─────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSites = async () => {
      try {
        const res = await api.get('/projects');
        const siteList = res.data || [];
        setSites(siteList);
        if (siteList.length > 0) {
          const saved = localStorage.getItem('adminSiteId');
          const match = siteList.find((s) => (s.id || s._id) === saved);
          setSelectedSiteId(match ? saved : (siteList[0].id || siteList[0]._id));
        }
      } catch (err) {
        console.error('Failed to fetch sites:', err);
      }
    };
    fetchSites();
  }, []);

  // ── Fetch cameras ────────────────────────────────────────────────────────
  const fetchCameras = useCallback(async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    try {
      const res = await api.get(`/cameras?site_id=${selectedSiteId}`);
      setCameras(res.data || []);
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
      toast.error('Failed to load cameras for this site');
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // ── Save (create / update) ───────────────────────────────────────────────
  const handleSaveCamera = async (e) => {
    e.preventDefault();
    if (!cameraForm.name.trim() || (!editingCamera && !cameraForm.rtsp_url.trim())) {
      return toast.error('Name and RTSP URL are required');
    }

    setSaving(true);
    try {
      const payload = {
        name: cameraForm.name,
        location: cameraForm.location,
        sub_stream_rtsp_url: cameraForm.sub_stream_rtsp_url || null,
        ptz_supported: cameraForm.ptz_supported,
        onvif_host: cameraForm.onvif_host || null,
      };

      if (cameraForm.rtsp_url.trim()) {
        payload.rtsp_url = cameraForm.rtsp_url.trim();
      }

      if (editingCamera) {
        await api.put(`/cameras/${editingCamera.id}`, payload);
        toast.success('Camera updated successfully');
      } else {
        await api.post('/cameras', { ...payload, site_id: selectedSiteId, rtsp_url: cameraForm.rtsp_url });
        toast.success('Camera added successfully');
      }

      closeModal();
      fetchCameras();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save camera');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingCamera(null);
    setCameraForm({ name: '', location: '', rtsp_url: '', sub_stream_rtsp_url: '', ptz_supported: false, onvif_host: '' });
  };

  const handleOpenEdit = (cam) => {
    setEditingCamera(cam);
    setCameraForm({
      name: cam.name,
      location: cam.location,
      rtsp_url: '',
      sub_stream_rtsp_url: '',
      ptz_supported: cam.ptz_supported || false,
      onvif_host: cam.onvif_host || '',
    });
    setShowAddModal(true);
  };

  const handleDeleteCamera = async (cam) => {
    if (!window.confirm(`Remove camera "${cam.name}"?`)) return;
    try {
      await api.delete(`/cameras/${cam.id}`);
      toast.success('Camera removed');
      fetchCameras();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete camera');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 text-[#2b4594] shrink-0">
            <Video size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">Live CCTV &amp; Cameras</h1>
            <p className="text-xs sm:text-sm text-slate-500">Real-time security monitoring · HLS stream</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Site selector */}
          {sites.length > 1 && (
            <div className="relative">
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[#2b4594]"
              >
                {sites.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Grid toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-0.5">
            <button
              onClick={() => setGridCols(1)}
              className={`p-1.5 rounded-lg transition-colors ${gridCols === 1 ? 'bg-white text-[#2b4594] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="Single column"
            >
              <Layers size={15} />
            </button>
            <button
              onClick={() => setGridCols(2)}
              className={`p-1.5 rounded-lg transition-colors ${gridCols === 2 ? 'bg-white text-[#2b4594] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="2-column grid"
            >
              <Grid size={15} />
            </button>
          </div>

          <button
            onClick={fetchCameras}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm touch-manipulation"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setEditingCamera(null);
                setCameraForm({ name: '', location: '', rtsp_url: '', sub_stream_rtsp_url: '', ptz_supported: false, onvif_host: '' });
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#2b4594] hover:bg-[#1e326e] text-white text-sm font-semibold rounded-xl transition-all shadow-sm touch-manipulation"
            >
              <Plus size={15} /> Add Camera
            </button>
          )}
        </div>
      </div>

      {/* ── Camera grid ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="animate-spin text-[#2b4594] mb-3" size={28} />
          <p className="text-sm font-semibold text-slate-600">Loading live camera feeds…</p>
        </div>
      ) : cameras.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-14 bg-white rounded-2xl border border-slate-200 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
            <Camera size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-800">No Cameras Configured</h3>
          <p className="text-sm text-slate-500 max-w-xs mt-1 mb-5">
            No CCTV cameras are linked to this site yet. Add one to start monitoring.
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2b4594] hover:bg-[#1e326e] text-white text-sm font-semibold rounded-xl shadow touch-manipulation"
            >
              <Plus size={15} /> Add First Camera
            </button>
          )}
        </div>
      ) : (
        <div
          className={`grid gap-4 sm:gap-6 ${
            gridCols === 1 ? 'grid-cols-1 max-w-3xl mx-auto' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {cameras.map((cam) => (
            <CameraStreamTile
              key={cam.id}
              camera={cam}
              isAdmin={isAdmin}
              onEdit={handleOpenEdit}
              onDelete={handleDeleteCamera}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showAddModal && (
        <CameraModal
          editingCamera={editingCamera}
          cameraForm={cameraForm}
          setCameraForm={setCameraForm}
          onSave={handleSaveCamera}
          onClose={closeModal}
          saving={saving}
        />
      )}
    </div>
  );
};

export default CamerasPage;
