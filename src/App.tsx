import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Camera, Users, LayoutDashboard, CheckCircle2, XCircle, Loader2, UserPlus, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { loadModels, getFaceEmbedding, createFaceMatcher } from './services/faceService';
import * as faceapi from 'face-api.js';

// --- Components ---

const Navbar = () => (
  <nav className="fixed top-0 left-0 right-0 h-16 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-6 z-50">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
        <ShieldCheck className="text-zinc-950 w-5 h-5" />
      </div>
      <span className="font-bold text-zinc-100 tracking-tight text-lg">FaceAttend <span className="text-emerald-500 italic">Pro</span></span>
    </div>
    <div className="flex items-center gap-6">
      <Link to="/" className="text-zinc-400 hover:text-zinc-100 transition-colors text-sm font-medium">Kiosk</Link>
      <Link to="/admin" className="text-zinc-400 hover:text-zinc-100 transition-colors text-sm font-medium">Dashboard</Link>
      <Link to="/register" className="text-zinc-400 hover:text-zinc-100 transition-colors text-sm font-medium">Enrollment</Link>
    </div>
  </nav>
);

const Kiosk = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('Position your face in the frame');
  const [lastUser, setLastUser] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [faceMatcher, setFaceMatcher] = useState<faceapi.FaceMatcher | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await loadModels();
        const res = await fetch('/api/users/embeddings');
        const data = await res.json();
        setUsers(data);
        if (data.length > 0) {
          setFaceMatcher(createFaceMatcher(data));
        }
        setIsLoaded(true);
        startVideo();
      } catch (err) {
        console.error(err);
        setMessage('Failed to load models');
      }
    };
    init();

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    if (!isLoaded || !videoRef.current || status !== 'idle') return;

    const interval = setInterval(async () => {
      if (videoRef.current && status === 'idle') {
        const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && faceMatcher) {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
          if (bestMatch.label !== 'unknown') {
            handleMatch(bestMatch.label);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoaded, status, faceMatcher]);

  const handleMatch = async (label: string) => {
    setStatus('scanning');
    setMessage(`Recognizing ${label}...`);
    
    const user = users.find(u => u.name === label);
    if (!user) return;

    try {
      const res = await fetch('/api/attendance/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, type: 'IN' })
      });
      const data = await res.json();
      
      if (data.success) {
        setStatus('success');
        setLastUser(label);
        setMessage(`Welcome back, ${label}!`);
        setTimeout(() => {
          setStatus('idle');
          setMessage('Position your face in the frame');
        }, 3000);
      }
    } catch (err) {
      setStatus('error');
      setMessage('System error. Try again.');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 pt-24 pb-12 px-6 flex flex-col items-center">
      <div className="max-w-2xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">Attendance Kiosk</h1>
          <p className="text-zinc-500">Real-time biometric authentication</p>
        </div>

        <div className="relative aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
          {!isLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 z-20">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="text-zinc-400 font-medium">Initializing Neural Engine...</p>
            </div>
          )}
          
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full h-full object-cover grayscale brightness-75 contrast-125"
          />
          
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 border-[40px] border-zinc-950/40" />
            <div className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-80 border-2 rounded-[40%] transition-all duration-500",
              status === 'success' ? "border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.3)]" : 
              status === 'scanning' ? "border-zinc-100 animate-pulse" : "border-zinc-500/50"
            )}>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-zinc-950 border-2 border-inherit rounded-full" />
            </div>
          </div>

          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className={cn(
                  "absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md border",
                  status === 'success' ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" :
                  status === 'scanning' ? "bg-zinc-100/10 border-zinc-100/20 text-zinc-100" :
                  "bg-red-500/20 border-red-500/50 text-red-400"
                )}
              >
                {status === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
                 status === 'scanning' ? <Loader2 className="w-5 h-5 animate-spin" /> : 
                 <XCircle className="w-5 h-5" />}
                <span className="font-semibold">{message}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-bold mb-1">Status</p>
            <p className="text-zinc-100 font-mono text-sm">{isLoaded ? 'ONLINE' : 'BOOTING'}</p>
          </div>
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-bold mb-1">Last Scan</p>
            <p className="text-zinc-100 font-mono text-sm truncate">{lastUser || '---'}</p>
          </div>
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-bold mb-1">Time</p>
            <p className="text-zinc-100 font-mono text-sm">{format(new Date(), 'HH:mm:ss')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [logsRes, usersRes] = await Promise.all([
          fetch('/api/attendance/logs'),
          fetch('/api/users')
        ]);
        setLogs(await logsRes.json());
        setUsers(await usersRes.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 pt-24 pb-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100">Analytics Dashboard</h1>
            <p className="text-zinc-500">Monitoring attendance and system health</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />
              <span className="text-zinc-100 font-bold">{users.length}</span>
              <span className="text-zinc-500 text-sm">Staff</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="font-bold text-zinc-100 flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-emerald-500" />
                Live Attendance Feed
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-950/50">
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-xs">
                            {log.name.charAt(0)}
                          </div>
                          <span className="text-zinc-100 font-medium">{log.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-zinc-400 font-mono text-sm">
                        {format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                          log.type === 'IN' ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-500/10 text-zinc-500"
                        )}>
                          {log.type === 'IN' ? 'Check-in' : 'Check-out'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-zinc-500 text-xs">Verified</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden h-fit">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="font-bold text-zinc-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                Enrolled Personnel
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {users.map(user => (
                <div key={user.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      <Users className="w-5 h-5 text-zinc-500" />
                    </div>
                    <div>
                      <p className="text-zinc-100 font-semibold text-sm">{user.name}</p>
                      <p className="text-zinc-500 text-[10px] uppercase tracking-wider">ID: 00{user.id}</p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                </div>
              ))}
              <Link to="/register" className="flex items-center justify-center gap-2 w-full py-3 mt-4 bg-zinc-100 text-zinc-950 rounded-xl font-bold text-sm hover:bg-white transition-colors">
                <UserPlus className="w-4 h-4" />
                Enroll New Staff
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Register = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [name, setName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('Position face for enrollment');
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      await loadModels();
      setIsLoaded(true);
      startVideo();
    };
    init();
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(err => console.error(err));
  };

  const handleEnroll = async () => {
    if (!name || !videoRef.current) return;
    
    setStatus('scanning');
    setMessage('Analyzing biometric features...');

    try {
      const embedding = await getFaceEmbedding(videoRef.current);
      if (!embedding) {
        setStatus('error');
        setMessage('No face detected. Try again.');
        setTimeout(() => setStatus('idle'), 2000);
        return;
      }

      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, embedding: Array.from(embedding) })
      });

      if (res.ok) {
        setStatus('success');
        setMessage('Enrollment successful!');
        setTimeout(() => navigate('/admin'), 2000);
      }
    } catch (err) {
      setStatus('error');
      setMessage('Enrollment failed.');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 pt-24 pb-12 px-6 flex flex-col items-center">
      <div className="max-w-md w-full">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">Staff Enrollment</h1>
          <p className="text-zinc-500">Securely register biometric profile</p>
        </div>

        <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-2xl">
          <div className="mb-6">
            <label className="block text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="relative aspect-square bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 mb-6">
            {!isLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              muted
              className="w-full h-full object-cover grayscale"
            />
            <div className="absolute inset-0 border-2 border-zinc-500/20 rounded-full m-8 pointer-events-none" />
          </div>

          <button
            onClick={handleEnroll}
            disabled={!name || status !== 'idle'}
            className={cn(
              "w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2",
              status === 'scanning' ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" :
              "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            )}
          >
            {status === 'scanning' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            {status === 'scanning' ? 'Processing...' : 'Capture & Enroll'}
          </button>
          
          <p className={cn(
            "mt-4 text-center text-sm font-medium transition-colors",
            status === 'error' ? "text-red-400" : status === 'success' ? "text-emerald-400" : "text-zinc-500"
          )}>
            {message}
          </p>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Kiosk />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}
