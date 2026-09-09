import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, X, Camera, RotateCcw } from 'lucide-react';
import publicApi from '../api/public';

// ─── Brand colors ─────────────────────────────────────────────────────────────
const BLUE = '#2b4594';
const BLUE_DARK = '#1e326e';

// ─── Step IDs ─────────────────────────────────────────────────────────────────
// welcome → group → details → safety → photo → signed-in
const STEPS = ['welcome', 'group', 'details', 'safety', 'photo', 'signed-in'];

// ─── Slim top bar ─────────────────────────────────────────────────────────────
const TopBar = ({ title, onContinue, continueLabel = 'Continue', continueDisabled = false }) => (
  <div className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-slate-100 flex items-center justify-between px-5 h-14 shadow-sm">
    <span className="text-lg font-semibold text-slate-800">{title}</span>
    {onContinue && (
      <button onClick={onContinue} disabled={continueDisabled}
        style={{ backgroundColor: BLUE, opacity: continueDisabled ? 0.5 : 1 }}
        className="px-5 py-1.5 text-white text-sm font-semibold rounded-full transition-opacity">
        {continueLabel}
      </button>
    )}
  </div>
);

// ─── Sign-out confirmation modal ──────────────────────────────────────────────
const SignOutModal = ({ name, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
    <div className="bg-white rounded-2xl w-full max-w-sm p-6 mb-4 shadow-2xl">
      <h3 className="text-lg font-bold text-slate-900 mb-3">Sign out</h3>
      <p className="text-sm text-slate-600 mb-6">
        Are you sure you wish to sign out? You should only do this once your visit is complete and you are leaving the site.
      </p>
      <div className="flex items-center justify-end gap-6">
        <button onClick={onCancel} className="text-sm font-semibold text-slate-600">Cancel</button>
        <button onClick={onConfirm} className="text-sm font-bold text-red-600">Sign out</button>
      </div>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const PublicVisitorCheckIn = () => {
  const { siteId } = useParams();

  const [site, setSite]     = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState('welcome');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [visitId, setVisitId] = useState(null); // track the created visit for sign-out

  // Form fields
  const [name, setName]       = useState('');
  const [company, setCompany] = useState('');
  const [employeeCompanyName, setEmployeeCompanyName] = useState('');
  const [visiting, setVisiting] = useState('');
  const [carReg, setCarReg]   = useState('');
  const [nameError, setNameError] = useState('');

  // Photo
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [cameraError, setCameraError]  = useState('');

  // Sign-out flow
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Submitting
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Load site + groups
  useEffect(() => {
    const load = async () => {
      try {
        const [siteRes, groupsRes] = await Promise.all([
          publicApi.get(`/projects/${siteId}/public`).catch(() => ({ data: null })),
          publicApi.get(`/visitor-groups?project_id=${siteId}`).catch(() => ({ data: [] })),
        ]);
        setSite(siteRes.data || { name: 'Reception', id: siteId });
        const grpList = (groupsRes.data || []).filter(g => g.allow_self_sign_in !== false);
        setGroups(grpList.length > 0 ? grpList : [
          { id: 'v', name: 'Visitors',   type: 'Standard' },
          { id: 'e', name: 'Employees',  type: 'Repeat'   },
          { id: 'd', name: 'Deliveries', type: 'Delivery' },
        ]);
      } catch {
        setSite({ name: 'Reception', id: siteId });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [siteId]);

  // When cameraActive becomes true, the video element is now in the DOM — attach stream
  const streamRef = useRef(null);

  // Ref callback — fires the instant the <video> element mounts
  // iOS Safari REQUIRES srcObject set on the element directly via ref
  const videoRefCallback = (el) => {
    videoRef.current = el;
    if (!el) return;
    // Attach stream immediately if already acquired
    if (streamRef.current) {
      el.srcObject = streamRef.current;
      el.muted = true;
      // Force play — iOS needs this explicit call
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay blocked — try again on user gesture (handled by onClick)
        });
      }
    }
  };

  // Camera helpers
  const startCamera = async () => {
    setCameraError('');

    // iOS Safari requires HTTPS
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (window.location.protocol !== 'https:' && !isLocalhost) {
      setCameraError('Camera requires HTTPS. Please open the site using https://');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera not available. Please use Safari on iPhone or Chrome on Android.');
      return;
    }

    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    // iOS camera constraint order — must try in this exact sequence
    const constraints = [
      { video: { facingMode: 'user' }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false },
    ];

    let stream = null;
    let lastErr = null;

    for (const constraint of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        break;
      } catch (err) {
        lastErr = err;
        continue;
      }
    }

    if (!stream) {
      const err = lastErr;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission denied.\n\niPhone: Go to Settings → Safari → Camera → Allow.\n\nOr tap the "AA" in the address bar → Website Settings → Camera → Allow.'
        );
      } else if (err?.name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        setCameraError('Camera is being used by another app. Close other apps and try again.');
      } else {
        setCameraError(`Camera error: ${err?.message || 'Unknown error'}. You can continue without a photo.`);
      }
      return;
    }

    streamRef.current = stream;

    // Set cameraActive FIRST so the <video> element renders
    setCameraActive(true);

    // Then wait a tick for the DOM to update, and attach stream
    // This is the key fix for iOS — the video element must exist before srcObject is set
    setTimeout(() => {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
    }, 100);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const doCapture = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;

    // Wait until the video has actual dimensions — iOS reports 0 until stream is ready
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) {
      // Not ready yet — retry in 150ms
      setTimeout(doCapture, 150);
      return;
    }

    // Cap to 800px wide to keep base64 payload small (prevents 413 on server)
    const MAX_WIDTH = 800;
    const scale = Math.min(1, MAX_WIDTH / w);
    c.width  = Math.round(w * scale);
    c.height = Math.round(h * scale);

    const ctx = c.getContext('2d');
    // Mirror horizontally to match the mirrored video preview
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);

    const dataUrl = c.toDataURL('image/jpeg', 0.7);
    // Sanity check — if canvas is blank the dataUrl is tiny (<1kb)
    if (dataUrl.length < 5000) {
      setTimeout(doCapture, 150);
      return;
    }

    setPhotoDataUrl(dataUrl);
    stopCamera();
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    doCapture();
  };

  const retakePhoto = () => { setPhotoDataUrl(null); startCamera(); };

  // Submit sign-in
  const handleSignIn = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const isEmp = selectedGroup?.name?.toLowerCase().includes('employee');
      const res = await publicApi.post('/visits/public', {
        site_id:               siteId,
        name:                  name.trim(),
        group:                 selectedGroup?.name || 'Visitor',
        trade:                 company.trim()  || undefined,
        employee_company_name: (isEmp && employeeCompanyName.trim()) ? employeeCompanyName.trim() : undefined,
        car_reg:               carReg.trim()   || undefined,
        reason:                visiting.trim() || undefined,
        photo_base64:          photoDataUrl    || undefined,  // send captured photo
      });
      setVisitId(res.data?.visit?.id || null);
      stopCamera();
      setStep('signed-in');
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Sign in failed. Please try again.');
      setSubmitting(false);
    }
  };

  // Submit sign-out
  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      if (visitId) await publicApi.post(`/visits/public/${visitId}/sign-out`);
      setShowSignOutModal(false);
      setSignedOut(true);
    } catch {
      setShowSignOutModal(false);
      setSignedOut(true); // still show signed-out screen even if API fails
    } finally {
      setSigningOut(false);
    }
  };

  // Navigate between steps
  const goToStep = (s) => { setSubmitError(''); setStep(s); };

  const handleDetailsContinue = () => {
    if (!name.trim()) { setNameError('Full name is required'); return; }
    setNameError('');
    goToStep('safety');
  };

  const handlePhotoContinue = () => {
    handleSignIn();
  };

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: BLUE, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // ── Signed out ────────────────────────────────────────────────────────────────
  if (signedOut) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
        <img src="/Tipod_Final_Logo_high_pixel.png" alt="Logo" className="h-16 w-auto object-contain mb-8" />
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Thank you for signing out</h1>
        <p className="text-slate-500 text-base">You can now close this window</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Welcome ────────────────────────────────────────────────────────── */}
      {step === 'welcome' && (
        <div className="flex-1 flex flex-col px-8 pt-16 pb-8">
          <img src="/Tipod_Final_Logo_high_pixel.png" alt="Logo" className="h-14 w-auto object-contain mb-10 self-start" />
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Welcome</h1>
          <p className="text-sm font-medium text-slate-500 mb-3">Signing in at {site?.name || 'Reception'}</p>
          <p className="text-base text-slate-600 mb-10">
            The following screens will allow you to sign in using your phone. Please follow the instructions and provide all of the information requested to successfully complete your sign in.
          </p>
          <div className="mt-auto flex justify-end">
            <button onClick={() => goToStep('group')}
              style={{ backgroundColor: BLUE }}
              className="px-8 py-3 text-white font-semibold rounded-full text-base hover:opacity-90 transition-opacity">
              Sign in
            </button>
          </div>
        </div>
      )}

      {/* ── Group select ───────────────────────────────────────────────────── */}
      {step === 'group' && (
        <div className="flex-1 flex flex-col px-6 pt-10 pb-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Group select</h1>
          <p className="text-sm text-slate-500 mb-8">Please choose a group to sign in to:</p>
          <div className="space-y-3">
            {groups.map(g => (
              <button key={g.id} onClick={() => {
                setSelectedGroup(g);
                if (!g.name?.toLowerCase().includes('employee')) {
                  setEmployeeCompanyName('');
                }
                goToStep('details');
              }}
                className="w-full text-left px-5 py-4 rounded-2xl border border-slate-200 bg-white text-slate-800 font-medium text-base hover:border-slate-400 active:bg-slate-50 transition-colors shadow-sm">
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Details ────────────────────────────────────────────────────────── */}
      {step === 'details' && (
        <>
          <TopBar title="Details" onContinue={handleDetailsContinue} />
          <div className="flex-1 flex flex-col px-6 pt-20 pb-8 space-y-5">
            <p className="text-sm text-slate-500">Please fill out your details below:<br /><span className="text-slate-400">Required fields are marked with (*)</span></p>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{submitError}</div>
            )}

            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full name *</label>
              <div className={`flex items-center border rounded-xl px-4 py-3 bg-white ${nameError ? 'border-red-400' : 'border-slate-200'}`}>
                <input value={name} onChange={e => { setName(e.target.value); setNameError(''); }}
                  placeholder="" className="flex-1 text-base text-slate-900 outline-none bg-transparent" />
                {name && <button onClick={() => setName('')} className="ml-2 text-slate-400"><X size={16} /></button>}
              </div>
              {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
            </div>

            {/* Company */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
              <div className="flex items-center border border-slate-200 rounded-xl px-4 py-3 bg-white">
                <input value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="" className="flex-1 text-base text-slate-900 outline-none bg-transparent" />
                {company && <button onClick={() => setCompany('')} className="ml-2 text-slate-400"><X size={16} /></button>}
              </div>
            </div>

            {/* Employee Company Name */}
            {selectedGroup?.name?.toLowerCase().includes('employee') && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Employee Company Name <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                </label>
                <div className="flex items-center border border-slate-200 rounded-xl px-4 py-3 bg-white">
                  <input value={employeeCompanyName} onChange={e => setEmployeeCompanyName(e.target.value)}
                    placeholder="Enter employee company name" className="flex-1 text-base text-slate-900 outline-none bg-transparent" />
                  {employeeCompanyName && <button onClick={() => setEmployeeCompanyName('')} className="ml-2 text-slate-400"><X size={16} /></button>}
                </div>
              </div>
            )}

            {/* Visiting */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Visiting</label>
              <div className="flex items-center border border-slate-200 rounded-xl px-4 py-3 bg-white">
                <input value={visiting} onChange={e => setVisiting(e.target.value)}
                  placeholder="" className="flex-1 text-base text-slate-900 outline-none bg-transparent" />
                <ChevronRight size={18} className="text-slate-300 ml-2" />
              </div>
            </div>

            {/* Car Reg */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Car Reg</label>
              <div className="flex items-center border border-slate-200 rounded-xl px-4 py-3 bg-white">
                <input value={carReg} onChange={e => setCarReg(e.target.value.toUpperCase())}
                  placeholder="" className="flex-1 text-base text-slate-900 outline-none bg-transparent font-mono tracking-wider" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Safety notice ──────────────────────────────────────────────────── */}
      {step === 'safety' && (
        <>
          <TopBar title="Messages" onContinue={() => goToStep('photo')} />
          <div className="flex-1 flex flex-col px-6 pt-20 pb-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Health &amp; Safety</h2>
            <div className="text-sm text-slate-700 leading-relaxed space-y-4">
              <p className="font-semibold uppercase text-xs text-slate-600 tracking-wide">
                YOUR PASS MUST BE WORN AT ALL TIMES. PLEASE RETURN YOUR PASS AND SIGN OUT UPON LEAVING
              </p>
              <p>
                All visitors are subject to the Company's Health &amp; Safety regulations. In case of fire/emergency please report to the evacuation points for a roll call. Smoking in designated areas only.
              </p>
              <p>
                Please be aware that CCTV is in operation on this site for security and safety purposes.
              </p>
              <p>
                By signing in you confirm that you have read and understood these notices.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Visitor photo ──────────────────────────────────────────────────── */}
      {step === 'photo' && (
        <>
          <TopBar
            title="Visitor photo"
            onContinue={handlePhotoContinue}
            continueLabel={submitting ? 'Signing in…' : 'Continue'}
            continueDisabled={submitting}
          />
          <div className="flex-1 flex flex-col items-center px-6 pt-20 pb-8">
            {cameraError ? (
              <div className="flex flex-col items-center text-center w-full max-w-xs mt-4">
                <div className="bg-red-50 text-red-500 rounded-full p-4 mb-6">
                  <Camera size={48} strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Camera Unavailable</h3>
                <p className="text-sm text-slate-600 mb-8 whitespace-pre-line">{cameraError}</p>
                <button 
                  onClick={() => { stopCamera(); handleSignIn(); }}
                  style={{ backgroundColor: BLUE }}
                  className="w-full py-4 text-white font-semibold rounded-full text-base shadow-md mb-4"
                >
                  Skip photo & sign in
                </button>
                <button 
                  onClick={startCamera}
                  className="w-full py-4 bg-slate-100 text-slate-700 font-semibold rounded-full text-base"
                >
                  Try camera again
                </button>
              </div>
            ) : (
              <>
                {/* Camera / preview circle */}
                <div className="relative w-64 h-64 rounded-full overflow-hidden bg-slate-100 border-4 border-slate-200 mb-6 flex items-center justify-center">
                  {photoDataUrl ? (
                    <img src={photoDataUrl} alt="Captured" className="w-full h-full object-cover" />
                  ) : cameraActive ? (
                    <video
                      ref={videoRefCallback}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={takePhoto}
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  ) : (
                    <button onClick={startCamera} className="flex flex-col items-center gap-3 text-slate-400">
                      <Camera size={48} strokeWidth={1.2} />
                      <span className="text-sm text-center px-4">Tap to activate camera</span>
                      <span className="text-xs text-center px-4 text-slate-400">Access to the camera will only be used for the purpose of signing you in</span>
                    </button>
                  )}
                </div>

                <canvas ref={canvasRef} className="hidden" />

                {submitError && <p className="text-sm text-red-500 text-center mb-4">{submitError}</p>}

                <p className="text-sm text-slate-600 text-center mb-6 max-w-xs">
                  Please take a photo of yourself using your phone's camera. This will be used to verify your identity on site.
                </p>

                {cameraActive && !photoDataUrl && (
                  <button onClick={takePhoto}
                    style={{ backgroundColor: BLUE }}
                    className="px-8 py-3 text-white font-semibold rounded-full mb-3">
                    Take photo
                  </button>
                )}

                {photoDataUrl && (
                  <button onClick={retakePhoto} className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-full">
                    <RotateCcw size={16} /> Retake
                  </button>
                )}

                {(!photoDataUrl) && (
                  <button onClick={() => { stopCamera(); handleSignIn(); }} className="text-sm text-slate-400 hover:text-slate-600 underline mt-4">
                    Skip photo & sign in
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Signed in ──────────────────────────────────────────────────────── */}
      {step === 'signed-in' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24 text-center">
          {/* Avatar / photo */}
          <div className="relative mb-6">
            <div className="w-28 h-28 rounded-full bg-slate-200 overflow-hidden border-4 border-slate-100">
              {photoDataUrl
                ? <img src={photoDataUrl} alt={name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-slate-500">
                    {name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
              }
            </div>
            {/* Online dot */}
            <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white" />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-4">Thank you for visiting</h1>
          <p className="text-slate-600 text-base mb-12 max-w-xs leading-relaxed">
            You are now signed in. Please keep this page open so you can sign out once your visit has finished.
          </p>

          {/* Sign out button */}
          <button onClick={() => setShowSignOutModal(true)}
            className="flex items-center gap-3 px-8 py-4 bg-slate-100 rounded-2xl text-slate-800 font-semibold text-base hover:bg-slate-200 active:bg-slate-300 transition-colors shadow-sm">
            <img src="/Tipod_Final_Logo_high_pixel.png" alt="" className="h-5 w-auto object-contain opacity-60" />
            Tap here to sign out
          </button>
        </div>
      )}

      {/* Sign-out confirmation modal */}
      {showSignOutModal && (
        <SignOutModal
          name={name}
          onCancel={() => setShowSignOutModal(false)}
          onConfirm={handleSignOut}
        />
      )}
    </div>
  );
};

export default PublicVisitorCheckIn;
