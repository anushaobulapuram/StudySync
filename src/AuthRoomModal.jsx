import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AuthRoomModal({ onLaunchSession, initialRoom = '' }) {
  const [activeTab, setActiveTab] = useState(initialRoom ? 'join' : 'create');

  // Form Fields
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoom || '');

  // Host Settings
  const [allowGuestDraw, setAllowGuestDraw] = useState(false);
  const [syncZoom, setSyncZoom] = useState(true);
  const [showPointers, setShowPointers] = useState(true);

  // Status & Validation Modal
  const [isValidating, setIsValidating] = useState(false);
  const [errorModal, setErrorModal] = useState(null); // { title, message, type: 'not_found' | 'ended' | 'error' }

  useEffect(() => {
    if (initialRoom) {
      setRoomCode(initialRoom);
      setActiveTab('join');
    }
  }, [initialRoom]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      alert('Please enter your Name or ID');
      return;
    }

    if (activeTab === 'create') {
      const generatedCode = 'studysync-' + Math.floor(1000 + Math.random() * 9000);
      setIsValidating(true);
      try {
        const roomPayload = {
          room_id: generatedCode,
          host: userName.trim(),
          room_type: 'public',
          passcode: '',
          permissions: {
            canDraw: allowGuestDraw,
            canText: false,
            canUpload: false,
            canVoiceChat: true,
            canSharePointer: showPointers,
            syncZoomGlobally: syncZoom,
          },
        };

        const { error: insertErr } = await supabase.from('study_rooms').insert([roomPayload]);
        if (insertErr) {
          console.error('Failed to create room in Supabase:', insertErr);
          alert('Failed to save room in database: ' + insertErr.message);
          return;
        }

        onLaunchSession({
          roomId: generatedCode,
          isHost: true,
          userName: userName.trim(),
          settings: {
            canDraw: allowGuestDraw,
            canText: false,
            canUpload: false,
            canVoiceChat: true,
            canSharePointer: showPointers,
            syncZoomGlobally: syncZoom,
          },
        });
      } catch (err) {
        console.error('Room creation error:', err);
        alert('Could not initialize room: ' + err.message);
      } finally {
        setIsValidating(false);
      }
    } else {
      const cleanCode = roomCode.trim().toLowerCase();
      if (!cleanCode) {
        alert('Please enter a valid Room Code');
        return;
      }

      if (!/^studysync-\d{4}$/.test(cleanCode)) {
        setErrorModal({
          type: 'not_found',
          title: 'Invalid Room Code',
          message: 'Please enter the exact Room Code provided by the host, for example studysync-6576.',
        });
        return;
      }

      setIsValidating(true);
      try {
        // Only an exact room ID that currently exists in Supabase can be joined.
        const { data, error } = await supabase
          .from('study_rooms')
          .select('*')
          .eq('room_id', cleanCode)
          .maybeSingle();

        if (error || !data) {
          setErrorModal({
            type: 'not_found',
            title: 'Room Not Found',
            message: `The room "${cleanCode}" does not exist in the database. Please verify the code or ask the host to initialize the session.`,
          });
          return;
        }

        const roomRecord = data;

        // Room exists in Supabase -> user can login!
        onLaunchSession({
          roomId: roomRecord.room_id,
          isHost: false,
          userName: userName.trim(),
          settings: roomRecord.permissions || {},
        });
      } catch (err) {
        console.error('Validation error:', err);
        setErrorModal({
          type: 'error',
          title: 'Connection Error',
          message: 'Unable to verify room with the StudySync server. Please check your connection and try again.',
        });
      } finally {
        setIsValidating(false);
      }
    }
  };

  return (
    <div className="relative w-full min-h-[100dvh] bg-[#EDE7DE] flex items-center justify-center p-3 sm:p-4 md:p-8 select-none font-['Inter',sans-serif] overflow-y-auto overflow-x-hidden">
      {/* Background Soft Organic Waves */}
      <div className="absolute -top-40 -left-40 w-[420px] h-[420px] sm:w-[550px] sm:h-[550px] bg-[#E3DDD1] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[460px] h-[460px] sm:w-[600px] sm:h-[600px] bg-[#DDD6C8] rounded-full blur-3xl pointer-events-none" />

      {/* Main Dual-Tone Card */}
      <div className="relative z-10 w-full max-w-4xl max-h-[96dvh] sm:max-h-none bg-[#F7F2E7] rounded-[24px] sm:rounded-[30px] md:rounded-[36px] shadow-[0_20px_60px_rgba(75,70,92,0.15)] border border-[#E6DFC8] overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-12">
        
        {/* Left Side: Soft Lavender Curved Section */}
        <div className="md:col-span-6 relative bg-[#767396] text-white p-6 sm:p-8 md:p-12 min-h-[300px] sm:min-h-[340px] md:min-h-[520px] flex flex-col justify-between overflow-hidden">
          <svg
            className="absolute -right-1 top-0 bottom-0 h-full w-24 text-[#F7F2E7] hidden md:block z-0 pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="currentColor"
          >
            <path d="M0,0 Q60,50 100,100 L100,0 Z" />
          </svg>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-5 sm:mb-8">
              <span className="w-3 h-3 rounded-full bg-[#E57A77]" />
              <span className="text-xs font-semibold tracking-wider text-white/90">studysync workspace</span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white leading-snug max-w-[320px]">
              {activeTab === 'create' ? "We're so glad to have you on board!" : "Welcome back!"}
            </h1>
            <p className="text-[11px] sm:text-xs text-white/80 mt-3 leading-relaxed max-w-[320px]">
              {activeTab === 'create'
                ? "Join peers and educators all over the world to collaborate and keep up with live notes and study sessions."
                : "Pick up right where you left off with your team on the shared infinite canvas."}
            </p>
          </div>

          <div className="relative z-10 my-2 sm:my-4 flex items-center justify-center">
            <div className="w-36 h-28 sm:w-48 sm:h-36 relative flex items-center justify-center">
              <div className="absolute inset-0 bg-white/10 rounded-full blur-md" />
              <svg className="w-28 h-28 sm:w-36 sm:h-36 text-white/90" viewBox="0 0 200 200" fill="none">
                <circle cx="80" cy="70" r="18" fill="#F4EBD0" />
                <path d="M60 130 C60 100, 100 100, 100 130" stroke="#F4EBD0" strokeWidth="8" strokeLinecap="round" />
                <circle cx="125" cy="75" r="16" fill="#F4EBD0" />
                <path d="M108 130 C108 105, 142 105, 142 130" stroke="#F4EBD0" strokeWidth="8" strokeLinecap="round" />
                <path d="M85 95 L120 95" stroke="#E57A77" strokeWidth="6" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className="relative z-10 pt-3 sm:pt-4">
            <span className="block text-[11px] text-white/70 mb-1.5">
              {activeTab === 'create' ? "Already have a session code?" : "Want to initialize a new room?"}
            </span>
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'create' ? 'join' : 'create')}
              className="text-xs font-bold text-[#F4EBD0] underline underline-offset-4 hover:text-white transition"
            >
              {activeTab === 'create' ? "Join Existing Session →" : "Create Host Room →"}
            </button>
          </div>
        </div>

        {/* Right Side: Warm Cream Form Panel */}
        <div className="md:col-span-6 p-6 sm:p-8 md:p-12 flex flex-col justify-center bg-[#F7F2E7] text-[#554F5E]">
          <div className="mb-5 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#484252]">
              {activeTab === 'create' ? 'Sign Up / Create' : 'Sign In / Join'}
            </h2>
            <span className="text-[11px] text-[#867E8F]">Fill in your credentials to launch session</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-[10px] font-semibold tracking-wider uppercase text-[#867E8F] mb-1">
                Name or Participant ID
              </label>
              <input
                type="text"
                required
                autoFocus
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Vaayuv"
                className="w-full min-h-10 pb-2 pt-1 bg-transparent border-b border-[#C8BEAB] text-sm sm:text-xs font-medium text-[#484252] placeholder-[#AFA595] outline-none focus:border-[#767396] transition"
              />
            </div>

            {activeTab === 'join' ? (
              <div>
                <label className="block text-[10px] font-semibold tracking-wider uppercase text-[#867E8F] mb-1">
                  Unique Room Code
                </label>
                <input
                  type="text"
                  required
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="e.g. studysync-6576"
                  className="w-full min-h-10 pb-2 pt-1 bg-transparent border-b border-[#C8BEAB] text-sm sm:text-xs font-mono font-semibold text-[#484252] placeholder-[#AFA595] outline-none focus:border-[#767396] transition"
                />
              </div>
            ) : (
              <>
                <div className="pt-2 space-y-2 text-xs">
                  <label className="flex items-center justify-between text-[11px] cursor-pointer text-[#6B6375]">
                    <span>Allow Guests to Draw Initially</span>
                    <input
                      type="checkbox"
                      checked={allowGuestDraw}
                      onChange={(e) => setAllowGuestDraw(e.target.checked)}
                      className="w-5 h-5 sm:w-4 sm:h-4 accent-[#767396] rounded cursor-pointer shrink-0"
                    />
                  </label>
                  <label className="flex items-center justify-between text-[11px] cursor-pointer text-[#6B6375]">
                    <span>Sync Zoom &amp; Scroll Globally</span>
                    <input
                      type="checkbox"
                      checked={syncZoom}
                      onChange={(e) => setSyncZoom(e.target.checked)}
                      className="w-5 h-5 sm:w-4 sm:h-4 accent-[#767396] rounded cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              </>
            )}

            <div className="pt-4">
              <span className="block text-[10px] text-[#9A91A3] mb-2">You're all set up!</span>
              <button
                type="submit"
                disabled={isValidating}
                className="w-full sm:w-auto justify-center px-6 py-3 sm:py-2 rounded-lg bg-[#767396] hover:bg-[#625F80] disabled:opacity-60 text-[#F7F2E7] text-xs font-semibold tracking-wide shadow-sm transition active:scale-95 flex items-center gap-2"
              >
                {isValidating && (
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                )}
                <span>{isValidating ? 'Verifying...' : 'Complete'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Professional Room Status Modal */}
      {errorModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto bg-[#F7F2E7] border border-[#E6DFC8] rounded-[22px] sm:rounded-[28px] p-5 sm:p-6 md:p-8 shadow-[0_25px_60px_rgba(75,70,92,0.22)] text-[#554F5E]">
            <div className="flex items-center gap-3.5 mb-4">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg ${
                  errorModal.type === 'ended'
                    ? 'bg-amber-500/15 text-amber-700'
                    : 'bg-[#E57A77]/15 text-[#C04946]'
                }`}
              >
                {errorModal.type === 'ended' ? '🚪' : '⚠️'}
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-[#484252]">
                  {errorModal.title}
                </h3>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#867E8F]">
                  StudySync Validation
                </span>
              </div>
            </div>

            <p className="text-xs text-[#6B6375] leading-relaxed mb-6">
              {errorModal.message}
            </p>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-3 border-t border-[#E6DFC8]">
              <button
                type="button"
                onClick={() => {
                  setErrorModal(null);
                  setActiveTab('create');
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-semibold text-[#767396] hover:bg-[#EBE4D5] transition"
              >
                Create Room Instead
              </button>
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#767396] hover:bg-[#625F80] text-[#F7F2E7] text-xs font-semibold shadow-sm transition active:scale-95"
              >
                Try Another Code
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
