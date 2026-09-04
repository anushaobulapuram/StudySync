import React, { useState } from 'react';

export default function AuthRoomModal({ onLaunchSession, initialRoom = '' }) {
  const [activeTab, setActiveTab] = useState(initialRoom ? 'join' : 'create');

  // Form Fields
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoom || '');
  const [maxParticipants, setMaxParticipants] = useState(15);

  // Host Settings
  const [allowGuestDraw, setAllowGuestDraw] = useState(true);
  const [syncZoom, setSyncZoom] = useState(true);
  const [showPointers, setShowPointers] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      alert('Please enter your Name or ID');
      return;
    }

    if (activeTab === 'create') {
      const generatedCode = 'studysync-' + Math.floor(1000 + Math.random() * 9000);
      onLaunchSession({
        roomId: generatedCode,
        isHost: true,
        userName: userName.trim(),
        settings: {
          canDraw: allowGuestDraw,
          syncZoomGlobally: syncZoom,
          canSharePointer: showPointers,
        },
      });
    } else {
      if (!roomCode.trim()) {
        alert('Please enter a valid Room Code');
        return;
      }
      onLaunchSession({
        roomId: roomCode.trim().toLowerCase(),
        isHost: false,
        userName: userName.trim(),
        settings: {},
      });
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#EDE7DE] flex items-center justify-center p-4 md:p-8 select-none font-['Inter',sans-serif] overflow-hidden">
      {/* Background Soft Organic Waves */}
      <div className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-[#E3DDD1] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-[#DDD6C8] rounded-full blur-3xl pointer-events-none" />

      {/* Main Dual-Tone Card */}
      <div className="relative z-10 w-full max-w-4xl min-h-[520px] bg-[#F7F2E7] rounded-[36px] shadow-[0_20px_60px_rgba(75,70,92,0.15)] border border-[#E6DFC8] overflow-hidden grid grid-cols-1 md:grid-cols-12">
        
        {/* Left Side: Soft Lavender Curved Section */}
        <div className="md:col-span-6 relative bg-[#767396] text-white p-8 md:p-12 flex flex-col justify-between overflow-hidden">
          {/* Decorative Diagonal Curve Cut */}
          <svg
            className="absolute -right-1 top-0 bottom-0 h-full w-24 text-[#F7F2E7] hidden md:block z-0 pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="currentColor"
          >
            <path d="M0,0 Q60,50 100,100 L100,0 Z" />
          </svg>

          {/* Top Branding */}
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <span className="w-3 h-3 rounded-full bg-[#E57A77]" />
              <span className="text-xs font-semibold tracking-wider text-white/90">studysync workspace</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white leading-snug">
              {activeTab === 'create' ? "We're so glad to have you on board!" : "Welcome back!"}
            </h1>
            <p className="text-xs text-white/80 mt-3 leading-relaxed max-w-[280px]">
              {activeTab === 'create'
                ? "Join peers and educators all over the world to collaborate and keep up with live notes and study sessions."
                : "Pick up right where you left off with your team on the shared infinite canvas."}
            </p>
          </div>

          {/* Vector Illustration */}
          <div className="relative z-10 my-4 flex items-center justify-center">
            <div className="w-48 h-36 relative flex items-center justify-center">
              <div className="absolute inset-0 bg-white/10 rounded-full blur-md" />
              <svg className="w-36 h-36 text-white/90" viewBox="0 0 200 200" fill="none">
                <circle cx="80" cy="70" r="18" fill="#F4EBD0" />
                <path d="M60 130 C60 100, 100 100, 100 130" stroke="#F4EBD0" strokeWidth="8" strokeLinecap="round" />
                <circle cx="125" cy="75" r="16" fill="#F4EBD0" />
                <path d="M108 130 C108 105, 142 105, 142 130" stroke="#F4EBD0" strokeWidth="8" strokeLinecap="round" />
                <path d="M85 95 L120 95" stroke="#E57A77" strokeWidth="6" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Switch Tab Trigger */}
          <div className="relative z-10 pt-4">
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
        <div className="md:col-span-6 p-8 md:p-12 flex flex-col justify-center bg-[#F7F2E7] text-[#554F5E]">
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-[#484252]">
              {activeTab === 'create' ? 'Sign Up / Create' : 'Sign In / Join'}
            </h2>
            <span className="text-[11px] text-[#867E8F]">Fill in your credentials to launch session</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name input */}
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
                className="w-full pb-2 pt-1 bg-transparent border-b border-[#C8BEAB] text-xs font-medium text-[#484252] placeholder-[#AFA595] outline-none focus:border-[#767396] transition"
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
                  className="w-full pb-2 pt-1 bg-transparent border-b border-[#C8BEAB] text-xs font-mono font-semibold text-[#484252] placeholder-[#AFA595] outline-none focus:border-[#767396] transition"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-semibold tracking-wider uppercase text-[#867E8F] mb-1">
                    Max Room Participants
                  </label>
                  <select
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(e.target.value)}
                    className="w-full pb-2 pt-1 bg-transparent border-b border-[#C8BEAB] text-xs font-medium text-[#484252] outline-none focus:border-[#767396] transition"
                  >
                    <option value={5}>5 Participants</option>
                    <option value={15}>15 Participants</option>
                    <option value={30}>30 Participants</option>
                    <option value={50}>50 Participants</option>
                  </select>
                </div>

                {/* Permissions Preview */}
                <div className="pt-2 space-y-2 text-xs">
                  <label className="flex items-center justify-between text-[11px] cursor-pointer text-[#6B6375]">
                    <span>Allow Guests to Draw</span>
                    <input
                      type="checkbox"
                      checked={allowGuestDraw}
                      onChange={(e) => setAllowGuestDraw(e.target.checked)}
                      className="w-4 h-4 accent-[#767396] rounded cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between text-[11px] cursor-pointer text-[#6B6375]">
                    <span>Sync Zoom &amp; Scroll Globally</span>
                    <input
                      type="checkbox"
                      checked={syncZoom}
                      onChange={(e) => setSyncZoom(e.target.checked)}
                      className="w-4 h-4 accent-[#767396] rounded cursor-pointer"
                    />
                  </label>
                </div>
              </>
            )}

            {/* Complete / Enter Button */}
            <div className="pt-4">
              <span className="block text-[10px] text-[#9A91A3] mb-2">You're all set up!</span>
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-[#767396] hover:bg-[#625F80] text-[#F7F2E7] text-xs font-semibold tracking-wide shadow-sm transition active:scale-95"
              >
                Complete
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}