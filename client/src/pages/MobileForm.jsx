import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { ChevronDown, X, Camera } from 'lucide-react';

// ── Health & Safety message shown on the Messages step ──────────────
const HEALTH_SAFETY_MESSAGE = `YOUR PASS MUST BE WORN AT ALL TIMES. PLEASE RETURN YOUR PASS AND SIGN OUT UPON LEAVING

All visitors are subject to the Company's Health & Safety regulations. In case of fire/emergency please report to the evacuation points for a roll call. Smoking in designated areas only.`;

// ── Steps ─────────────────────────────────────────────────────────────
// 1. welcome  2. group  3. details  4. messages  5. photo  6. signed-in  7. signed-out

const BRAND_BLUE = '#2b4594';

const DEFAULT_GROUPS = [
    { id: 'visitor', name: 'Visitor' },
    { id: 'employee', name: 'Employee' },
    { id: 'delivery', name: 'Delivery' },
    { id: 'contractor', name: 'Contractor' },
];

const MobileForm = () => {
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [groups, setGroups] = useState([]);

    const [step, setStep] = useState('welcome');   // welcome | group | details | messages | photo | signedin | signedout
    const [selectedGroup, setSelectedGroup] = useState(null);

    // Details form
    const [name, setName] = useState('');
    const [employeeCompanyName, setEmployeeCompanyName] = useState('');
    const [visiting, setVisiting] = useState('');
    const [visitingOpen, setVisitingOpen] = useState(false);
    const [members, setMembers] = useState([]);
    const [memberSearch, setMemberSearch] = useState('');
    const [memberSuggestions, setMemberSuggestions] = useState([]);
    const [carReg, setCarReg] = useState('');
    const [errors, setErrors] = useState({});

    // Photo
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [photoData, setPhotoData] = useState(null); // base64 data URL
    const [cameraActive, setCameraActive] = useState(false);

    // Sign-in record id for sign-out
    const [logId, setLogId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [signOutOpen, setSignOutOpen] = useState(false);

    // ── Load project from localStorage ──────────────────────────────
    useEffect(() => {
        const p = localStorage.getItem('currentProject');
        if (!p) { navigate('/mobile-landing'); return; }
        const parsed = JSON.parse(p);
        if (!parsed.code) { localStorage.removeItem('currentProject'); navigate('/mobile-landing'); return; }
        setProject(parsed);
    }, [navigate]);

    // ── Load visitor groups for this project ─────────────────────────
    useEffect(() => {
        if (!project?.id) return;
        api.get('/visitor-groups', { params: { project_id: project.id } })
            .then(r => {
                const fromApi = Array.isArray(r.data) ? r.data : [];
                const normalized = fromApi.map(g => ({
                    ...g,
                    id: g?.id || g?._id || g?.name,
                    name: g?.name || 'Visitor'
                }));

                // Ensure the group selection always offers the common options,
                // even if the database only has a single custom group (e.g. "Guard").
                const merged = [...DEFAULT_GROUPS, ...normalized].reduce((acc, g) => {
                    const key = String(g.name || '').trim().toLowerCase();
                    if (!key) return acc;
                    if (!acc.seen.has(key)) {
                        acc.seen.add(key);
                        acc.items.push(g);
                    }
                    return acc;
                }, { seen: new Set(), items: [] }).items;

                setGroups(merged);
            })
            .catch(() => setGroups(DEFAULT_GROUPS));
    }, [project]);

    // ── Load members for the visiting dropdown ───────────────────────
    useEffect(() => {
        if (!project?.id) return;
        api.get('/guards/members', { params: { status: 'Current', site_id: project.id } })
            .then(r => setMembers(r.data || []))
            .catch(() => setMembers([]));
    }, [project]);

    // ── Member search suggestions ────────────────────────────────────
    useEffect(() => {
        if (!memberSearch.trim()) { setMemberSuggestions([]); return; }
        const filtered = members.filter(m =>
            m.name?.toLowerCase().includes(memberSearch.toLowerCase())
        ).slice(0, 6);
        setMemberSuggestions(filtered);
    }, [memberSearch, members]);

    // ── Camera helpers ───────────────────────────────────────────────
    const startCamera = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            setStream(s);
            setCameraActive(true);
            setTimeout(() => {
                if (videoRef.current) videoRef.current.srcObject = s;
            }, 100);
        } catch { /* permission denied – show fallback */ }
    };

    const stopCamera = () => {
        stream?.getTracks().forEach(t => t.stop());
        setStream(null);
        setCameraActive(false);
    };

    const takePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 320;
        canvas.getContext('2d').drawImage(video, 0, 0);
        setPhotoData(canvas.toDataURL('image/jpeg', 0.85));
        stopCamera();
    };

    const retake = () => {
        setPhotoData(null);
        startCamera();
    };

    // ── Validation for details step ─────────────────────────────────
    const validateDetails = () => {
        const e = {};
        if (!name.trim()) e.name = 'Full name is required';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // ── Submit sign-in to the server ─────────────────────────────────
    const handleSignIn = async () => {
        setSubmitting(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            // Build form data (photo if captured)
            const formData = new FormData();
            formData.append('project_code', project.code);
            formData.append('name', name.trim());
            formData.append('car_reg', carReg.trim() || '');
            formData.append('user_type', selectedGroup?.name || 'Visitor');
            if (employeeCompanyName.trim()) {
              formData.append('employee_company_name', employeeCompanyName.trim());
            }
            formData.append('date', today);
            formData.append('time_in', timeStr);
            if (visiting) formData.append('reason', `Visiting: ${visiting}`);

            if (photoData) {
                // Convert base64 to blob
                const res = await fetch(photoData);
                const blob = await res.blob();
                formData.append('image', blob, 'photo.jpg');
            }

            const response = await api.post('/logs', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setLogId(response.data.id);
            setStep('signedin');
        } catch (err) {
            console.error('Sign-in failed', err);
            // Still move forward so UX isn't broken
            setStep('signedin');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Sign out ─────────────────────────────────────────────────────
    const handleSignOut = async () => {
        setSignOutOpen(false);
        if (logId) {
            try { await api.post(`/logs/${logId}/checkout`); } catch { /* ignore */ }
        }
        setStep('signedout');
    };

    // ── Cleanup camera on unmount ────────────────────────────────────
    useEffect(() => () => stopCamera(), []);

    if (!project) return null;

    // ════════════════════════════════════════════════════════════════
    // STEP: WELCOME
    // ════════════════════════════════════════════════════════════════
    if (step === 'welcome') {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 py-12">
                {/* Logo */}
                <div className="mb-10">
                    <img src="/Tipod_Final_Logo_high_pixel.png" alt="Logo" className="w-20 h-20 object-contain" />
                </div>

                <h1 className="text-3xl font-light text-slate-900 mb-4">Welcome</h1>
                <p className="text-slate-600 text-center text-base leading-relaxed mb-12 max-w-xs">
                    The following screens will allow you to sign in using your phone. Please follow the instructions and provide all of the information requested to successfully complete your sign in.
                </p>

                <div className="w-full max-w-xs flex justify-end">
                    <button
                        onClick={() => setStep('group')}
                        style={{ backgroundColor: BRAND_BLUE }}
                        className="px-8 py-3 text-white font-semibold rounded-lg text-base shadow"
                    >
                        Sign in
                    </button>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP: GROUP SELECT
    // ════════════════════════════════════════════════════════════════
    if (step === 'group') {
        const displayGroups = groups.length > 0
            ? groups
            : [{ id: 'visitors', name: 'Visitors' }, { id: 'employees', name: 'Employees' }, { id: 'deliveries', name: 'Deliveries' }];

        return (
            <div className="min-h-screen bg-white flex flex-col px-6 py-8">
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Group select</h2>
                <div className="w-full h-px bg-slate-200 mb-6" />
                <p className="text-slate-600 mb-8">Please choose a group to sign in to:</p>

                <div className="flex flex-col gap-4">
                    {displayGroups.map(g => (
                        <button
                            key={g.id || g.name}
                            onClick={() => {
                                setSelectedGroup(g);
                                setEmployeeCompanyName('');
                                setStep('details');
                            }}
                            className="w-full py-4 rounded-xl border border-slate-200 text-slate-700 text-base font-medium shadow-sm hover:border-slate-400 transition-colors bg-white"
                        >
                            {g.name}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP: DETAILS
    // ════════════════════════════════════════════════════════════════
    if (step === 'details') {
        const isVisitor = selectedGroup?.name?.toLowerCase().includes('visitor');

        return (
            <div className="min-h-screen bg-white flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h2 className="text-2xl font-semibold text-slate-900">Details</h2>
                    <button
                        onClick={() => {
                            if (!validateDetails()) return;
                            setStep('messages');
                        }}
                        style={{ backgroundColor: BRAND_BLUE }}
                        className="px-5 py-2 text-white font-semibold rounded-lg text-sm"
                    >
                        Continue
                    </button>
                </div>

                <div className="px-6 py-6 flex flex-col gap-5">
                    <p className="text-slate-700">Please fill out your details below:</p>
                    <p className="text-slate-500 text-sm -mt-3">Required fields are marked with (*)</p>

                    {/* Full name */}
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Full name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => { setName(e.target.value); setErrors({}); }}
                            placeholder="Your full name"
                            className={`w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 ${errors.name ? 'border-red-400 focus:ring-red-300' : 'border-slate-300 focus:ring-blue-300'}`}
                        />
                        {errors.name && <p className="text-red-500 text-xs">{errors.name}</p>}
                    </div>

                    {/* Optional company name — shown only after a person type is chosen. */}
                    {selectedGroup?.name && (
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-slate-700">
                                {selectedGroup.name.replace(/s$/i, '')} Company Name <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                            </label>
                            <input
                                type="text"
                                value={employeeCompanyName}
                                onChange={e => setEmployeeCompanyName(e.target.value)}
                                placeholder={`Enter ${selectedGroup.name.replace(/s$/i, '').toLowerCase()} company name`}
                                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                        </div>
                    )}

                    {/* Visiting — dropdown for visitors, plain text for others */}
                    {isVisitor && (
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-slate-700">Visiting</label>
                            <div className="relative">
                                <div
                                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base flex items-center justify-between cursor-pointer bg-white"
                                    onClick={() => setVisitingOpen(o => !o)}
                                >
                                    {visiting ? (
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-xs text-slate-600 flex-shrink-0">
                                                {visiting[0]?.toUpperCase()}
                                            </div>
                                            <span className="truncate text-slate-800">{visiting}</span>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); setVisiting(''); setMemberSearch(''); }}
                                                className="ml-1 text-slate-400 hover:text-slate-700 flex-shrink-0"
                                            >
                                                <X size={15} />
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-slate-400">Select person</span>
                                    )}
                                    <ChevronDown size={18} className="text-slate-400 flex-shrink-0 ml-2" />
                                </div>

                                {visitingOpen && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden">
                                        <div className="p-2 border-b border-slate-100">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={memberSearch}
                                                onChange={e => setMemberSearch(e.target.value)}
                                                placeholder="Search members..."
                                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                            />
                                        </div>
                                        <div className="max-h-52 overflow-y-auto">
                                            {memberSearch.trim() && memberSuggestions.length === 0 && (
                                                <p className="px-4 py-3 text-sm text-slate-500">No members found</p>
                                            )}
                                            {memberSuggestions.map(m => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => { setVisiting(m.name); setMemberSearch(''); setVisitingOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                >
                                                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                                                        {m.name?.[0]?.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{m.name}</p>
                                                        {m.visitor_group && <p className="text-xs text-slate-400">{m.visitor_group}</p>}
                                                    </div>
                                                </button>
                                            ))}
                                            {!memberSearch.trim() && members.slice(0, 8).map(m => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => { setVisiting(m.name); setMemberSearch(''); setVisitingOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                >
                                                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                                                        {m.name?.[0]?.toUpperCase()}
                                                    </div>
                                                    <span className="font-medium">{m.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Car Reg */}
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Car Reg</label>
                        <input
                            type="text"
                            value={carReg}
                            onChange={e => setCarReg(e.target.value.toUpperCase())}
                            placeholder="e.g. AB12 CDE"
                            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                </div>

                {/* Bottom continue button */}
                <div className="px-6 pb-8 mt-auto">
                    <button
                        onClick={() => { if (validateDetails()) setStep('messages'); }}
                        style={{ backgroundColor: BRAND_BLUE }}
                        className="w-full py-4 text-white font-semibold rounded-xl text-base shadow"
                    >
                        Continue
                    </button>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP: MESSAGES (Health & Safety)
    // ════════════════════════════════════════════════════════════════
    if (step === 'messages') {
        return (
            <div className="min-h-screen bg-white flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h2 className="text-2xl font-semibold text-slate-900">Messages</h2>
                    <button
                        onClick={() => setStep('photo')}
                        style={{ backgroundColor: BRAND_BLUE }}
                        className="px-5 py-2 text-white font-semibold rounded-lg text-sm"
                    >
                        Continue
                    </button>
                </div>

                <div className="px-6 py-8 flex flex-col gap-6">
                    <h3 className="text-xl font-bold text-slate-900">Health &amp; Safety</h3>
                    <div className="text-slate-700 text-base leading-relaxed whitespace-pre-line">
                        {HEALTH_SAFETY_MESSAGE}
                    </div>
                </div>

                <div className="px-6 pb-8 mt-auto">
                    <button
                        onClick={() => setStep('photo')}
                        style={{ backgroundColor: BRAND_BLUE }}
                        className="w-full py-4 text-white font-semibold rounded-xl text-base shadow"
                    >
                        Continue
                    </button>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP: PHOTO
    // ════════════════════════════════════════════════════════════════
    if (step === 'photo') {
        return (
            <div className="min-h-screen bg-white flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h2 className="text-2xl font-semibold text-slate-900">Visitor photo</h2>
                    <button
                        onClick={() => { stopCamera(); handleSignIn(); }}
                        style={{ backgroundColor: photoData ? BRAND_BLUE : '#94a3b8' }}
                        className="px-5 py-2 text-white font-semibold rounded-lg text-sm"
                    >
                        Continue
                    </button>
                </div>

                <div className="flex flex-col items-center px-6 py-10 gap-6">
                    {/* Camera / photo area */}
                    {!photoData && !cameraActive && (
                        <button
                            onClick={startCamera}
                            className="w-56 h-56 rounded-full bg-slate-100 flex flex-col items-center justify-center gap-3 text-slate-500 hover:bg-slate-200 transition-colors"
                        >
                            <Camera size={44} strokeWidth={1.2} />
                            <span className="text-sm font-medium">Tap to activate camera</span>
                            <span className="text-xs text-slate-400 text-center px-6">Access to the camera will only be used for the purpose of signing you in</span>
                        </button>
                    )}

                    {cameraActive && !photoData && (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-64 h-64 rounded-full overflow-hidden bg-black">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <button
                                onClick={takePhoto}
                                className="w-16 h-16 rounded-full border-4 border-slate-300 bg-white shadow flex items-center justify-center"
                            >
                                <div className="w-12 h-12 rounded-full bg-slate-700" />
                            </button>
                        </div>
                    )}

                    {photoData && (
                        <div className="flex flex-col items-center gap-4">
                            <img src={photoData} alt="Your photo" className="w-64 h-64 rounded-full object-cover" />
                            <button
                                onClick={retake}
                                className="px-6 py-2 border border-slate-300 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50"
                            >
                                Retake
                            </button>
                        </div>
                    )}

                    <p className="text-slate-600 text-center text-sm max-w-xs">
                        Please take a photo of yourself using your phone&apos;s camera. This will be used to verify your identity on site.
                    </p>

                    {/* Skip option */}
                    <button
                        onClick={() => { stopCamera(); handleSignIn(); }}
                        className="text-sm text-slate-400 hover:text-slate-600 underline"
                    >
                        Skip photo
                    </button>
                </div>

                {/* Hidden canvas for capture */}
                <canvas ref={canvasRef} className="hidden" />

                {submitting && (
                    <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
                        <div className="w-10 h-10 border-4 border-blue-200 border-t-[#2b4594] rounded-full animate-spin" />
                    </div>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP: SIGNED IN
    // ════════════════════════════════════════════════════════════════
    if (step === 'signedin') {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 py-12 text-center">
                {/* Avatar with green dot */}
                <div className="relative mb-8">
                    {photoData ? (
                        <img src={photoData} alt="You" className="w-28 h-28 rounded-full object-cover" />
                    ) : (
                        <div className="w-28 h-28 rounded-full bg-slate-200 flex items-center justify-center text-3xl font-bold text-slate-600">
                            {name?.[0]?.toUpperCase() || '?'}
                        </div>
                    )}
                    <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white" />
                </div>

                <h1 className="text-2xl font-light text-slate-900 mb-4">Thank you for visiting</h1>
                <p className="text-slate-600 text-base mb-10 max-w-xs leading-relaxed">
                    You are now signed in. Please keep this page open so you can sign out once your visit has finished.
                </p>

                <button
                    onClick={() => setSignOutOpen(true)}
                    className="flex items-center gap-3 px-6 py-4 rounded-xl border border-slate-200 shadow-sm bg-white text-slate-700 text-base font-medium hover:bg-slate-50 transition-colors"
                >
                    <span className="text-red-500 text-xl">▲</span>
                    Tap here to sign out
                </button>

                {/* Sign out confirmation dialog */}
                {signOutOpen && (
                    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 pb-0">
                        <div className="w-full max-w-md bg-white rounded-t-3xl p-8">
                            <h3 className="text-lg font-bold text-slate-900 mb-3">Sign out</h3>
                            <p className="text-slate-600 text-sm mb-6">
                                Are you sure you wish to sign out? You should only do this once your visit is complete and you are leaving the site.
                            </p>
                            <div className="flex justify-end gap-6">
                                <button
                                    onClick={() => setSignOutOpen(false)}
                                    className="text-slate-600 font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSignOut}
                                    className="text-red-500 font-semibold"
                                >
                                    Sign out
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP: SIGNED OUT
    // ════════════════════════════════════════════════════════════════
    if (step === 'signedout') {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 py-12 text-center">
                {/* Red chevron logo */}
                <div className="mb-8">
                    <svg width="72" height="60" viewBox="0 0 72 60" fill="none">
                        <path d="M6 10 L36 46 L66 10" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <h1 className="text-2xl font-light text-slate-900 mb-3">Thank you for signing out</h1>
                <p className="text-slate-500 text-base">You can now close this window</p>
                <button
                    onClick={() => {
                        localStorage.removeItem('currentProject');
                        navigate('/mobile-landing');
                    }}
                    className="mt-10 text-sm text-slate-400 underline hover:text-slate-600"
                >
                    Back to start
                </button>
            </div>
        );
    }

    return null;
};

export default MobileForm;
