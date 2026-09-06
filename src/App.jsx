/* STUDYSYNC_SYNC_FINAL - drawing sync / permission / host handoff build */
import React, { useRef, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AuthRoomModal from './AuthRoomModal';

export default function App() {
  const bgCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const drawCtxRef = useRef(null);
  const laserCanvasRef = useRef(null);
  const laserCtxRef = useRef(null);
  const fileInputRef = useRef(null);
  const channelRef = useRef(null);
  const channelReadyRef = useRef(false);
  const boardOutboxRef = useRef([]);
  const isHostRef = useRef(false);
  const isCoHostRef = useRef(false);
  const permissionsRef = useRef({});
  const userPermissionsRef = useRef({});
  const toolRef = useRef('pencil');
  const colorRef = useRef('#2563eb');
  const lineWidthRef = useRef(3);
  const isDrawingRef = useRef(false);
  const viewportRef = useRef(null);

  // Audio / WebRTC Multi-Peer Mesh Refs
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // peerId -> RTCPeerConnection
  const remoteAudiosRef = useRef({}); // peerId -> HTMLAudioElement
  const pendingCandidatesRef = useRef({}); // peerId -> ICE candidates received before remoteDescription
  const makingOfferRef = useRef({}); // peerId -> offer in progress
  const voiceRecoveryTimersRef = useRef({}); // peerId -> recovery timer
  const myClientId = useRef('user-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36).substring(4)).current;

  // Screen Recording
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Sticky Notes State
  const [stickyNotes, setStickyNotes] = useState([]);

  // Session State
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [isCoHost, setIsCoHost] = useState(false); // Co-host state
  const [coHostIds, setCoHostIds] = useState([]); // List of co-host clientIds
  const [initialUrlRoom, setInitialUrlRoom] = useState('');
  const autoRestoreAttemptedRef = useRef(false);
  const leavingRoomRef = useRef(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [activeTabPermissions, setActiveTabPermissions] = useState('global'); // 'global' | 'participants'
  const [copiedLink, setCopiedLink] = useState(false);
  const [showHostLeaveModal, setShowHostLeaveModal] = useState(false);
  const [selectedHostSuccessor, setSelectedHostSuccessor] = useState('');

  // Participants & Presence
  const [participants, setParticipants] = useState([]);

  // In-App Slides Gallery
  const [savedSlides, setSavedSlides] = useState([]);
  const [showSlidesDrawer, setShowSlidesDrawer] = useState(false);
  const [snapNotice, setSnapNotice] = useState(false);

  // Live In-Room Chat State
  const [showChatPad, setShowChatPad] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef(null);

  // Host Permissions (Global Defaults)
  const [permissions, setPermissions] = useState({
    canDraw: false,
    canText: false,
    canUpload: false,
    canVoiceChat: true,
    canSharePointer: true,
    syncZoomGlobally: true,
  });

  // Client Individual Permissions (host can override these per participant)
  const [userPermissions, setUserPermissions] = useState({
    canDraw: null,
    canText: null,
    canUpload: null,
    canVoice: null,
    canSharePointer: null,
  });

  // Host's Map of Per-Participant Overrides
  const [participantOverrides, setParticipantOverrides] = useState({});

  // Tools: 'select' | 'pencil' | 'highlighter' | 'smart' | 'laser' | 'sticky' | 'eraser' | 'text' | 'extract' | shapes
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#2563eb');
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);

  // Magic / Laser Points & Fade Loop (1.5 seconds lifespan)
  const laserPointsRef = useRef([]);

  // Dynamic Object Canvas Engine for Move / Drag Feature (by element ID)
  const elementsRef = useRef([]);
  const [selectedElementId, setSelectedElementId] = useState(null);

  const makeElementId = (kind = 'element') =>
    `${myClientId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const mergeRemoteElements = (incoming = []) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const byId = new Map(elementsRef.current.map((el) => [String(el.id), el]));
    incoming.forEach((incomingEl) => {
      if (!incomingEl || incomingEl.id === undefined || incomingEl.id === null) return;
      const id = String(incomingEl.id);
      const current = byId.get(id);
      const incomingTime = Number(incomingEl.updatedAt || incomingEl.createdAt || 0);
      const currentTime = Number(current?.updatedAt || current?.createdAt || 0);
      if (!current || incomingTime >= currentTime) byId.set(id, incomingEl);
    });
    elementsRef.current = Array.from(byId.values());
    redrawCanvas();
  };

  const safeBroadcast = async (event, payload, { queue = false } = {}) => {
    const channel = channelRef.current;
    if (!channel || !channelReadyRef.current) {
      if (queue) boardOutboxRef.current.push({ event, payload });
      return false;
    }
    try {
      const status = await channel.send({ type: 'broadcast', event, payload });
      if (status !== 'ok') console.warn(`StudySync broadcast ${event} status:`, status);
      return status === 'ok';
    } catch (err) {
      console.warn(`StudySync broadcast ${event} failed:`, err);
      if (queue) boardOutboxRef.current.push({ event, payload });
      return false;
    }
  };

  const flushBoardOutbox = async () => {
    const pending = [...boardOutboxRef.current];
    boardOutboxRef.current = [];
    for (const item of pending) await safeBroadcast(item.event, item.payload, { queue: true });
  };
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const isDraggingElementRef = useRef(false);

  // Smart Draw Points
  const currentStrokeRef = useRef([]);
  const strokeStartTimeRef = useRef(0);

  // Infinite Scroll & Zoom Viewport
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const zoomScaleRef = useRef(1);

  // Strict Private Notes State (100% private, never broadcasted, persistent)
  const [showNotesPad, setShowNotesPad] = useState(false);
  const [privateNotes, setPrivateNotes] = useState('');
  const [notesSaveStatus, setNotesSaveStatus] = useState('Saved');
  const [copySuccess, setCopySuccess] = useState(false);

  // OCR State
  const [isExtracting, setIsExtracting] = useState(false);

  // PDF Single Page State
  const pdfDocRef = useRef(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);

  // Pointer State
  const [shareMyPointer, setShareMyPointer] = useState(true);
  const [remoteCursors, setRemoteCursors] = useState({});

  // Voice State
  const [isMicOn, setIsMicOn] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);

  // Document Presence
  const [hasDocument, setHasDocument] = useState(false);

  // Popover Toggles
  const [showShapesMenu, setShowShapesMenu] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);

  // Drag snapshot
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [snapshot, setSnapshot] = useState(null);

  // Text state
  const [textInput, setTextInput] = useState({ visible: false, x: 0, y: 0, text: '' });
  const textInputRef = useRef(null);

  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  // Office / Word Style Color Matrices
  const themePalette = [
    ['#ffffff', '#000000', '#eeece1', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646'],
    ['#f2f2f2', '#7f7f7f', '#ddd9c3', '#c6d9f0', '#dce6f1', '#f2dcdb', '#ebf1dd', '#e5e0ec', '#dbeef3', '#fdeada'],
    ['#d8d8d8', '#595959', '#c4bd97', '#8db3e2', '#b8cce4', '#e5b9b7', '#d7e3bc', '#ccc1d9', '#b7dde8', '#fbd5b5'],
    ['#bfbfbf', '#3f3f3f', '#948a54', '#548dd4', '#95b3d7', '#d99694', '#c3d69b', '#b2a2c7', '#92cddc', '#fac08f'],
    ['#a5a5a5', '#262626', '#494429', '#17365d', '#366092', '#953734', '#76933c', '#5f497a', '#31859b', '#e36c09'],
    ['#7f7f7f', '#0c0c0c', '#1d1b10', '#0f243e', '#244061', '#632423', '#4f6128', '#3f3151', '#205867', '#974806'],
  ];

  const standardColors = [
    '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050',
    '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0',
  ];

  const [recentColors, setRecentColors] = useState([
    '#2563eb', '#0f172a', '#ea580c', '#16a34a', '#db2777', '#7c3aed',
  ]);

  const selectColor = (newColor) => {
    setColor(newColor);
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== newColor.toLowerCase());
      return [newColor, ...filtered].slice(0, 10);
    });
  };

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { isCoHostRef.current = isCoHost; }, [isCoHost]);
  useEffect(() => { permissionsRef.current = permissions; }, [permissions]);
  useEffect(() => { userPermissionsRef.current = userPermissions; }, [userPermissions]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { lineWidthRef.current = lineWidth; }, [lineWidth]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const existingRoom = urlParams.get('room');
    if (existingRoom) {
      setInitialUrlRoom(existingRoom);
    }
  }, []);

  const handleLaunchSession = async ({ roomId: targetRoom, isHost: hostStatus, userName: name, settings }) => {
    const cleanId = String(targetRoom || '').trim().toLowerCase();
    const fullCode = cleanId.startsWith('studysync-') ? cleanId : `studysync-${cleanId}`;

    try {
      if (!hostStatus) {
        // Guest must join the exact room created by the host.
        const { data, error } = await supabase
          .from('study_rooms')
          .select('room_id, permissions')
          .eq('room_id', fullCode)
          .maybeSingle();

        if (error || !data) {
          alert(`Room "${cleanId}" does not exist. Ask the host for the correct room code.`);
          return;
        }

        setPermissions((prev) => ({
          ...prev,
          ...(data.permissions || {}),
        }));
      } else if (settings) {
        setPermissions((prev) => ({ ...prev, ...settings }));
      }

      // Every room starts from a clean client-side workspace. Nothing from
      // the previous room is allowed to leak into the new room.
      elementsRef.current = [];
      laserPointsRef.current = [];
      boardOutboxRef.current = [];
      currentStrokeRef.current = [];
      setStickyNotes([]);
      setMessages([]);
      setSavedSlides([]);
      setHasDocument(false);
      setShowSlidesDrawer(false);
      setShowChatPad(false);
      setTextInput({ visible: false, x: 0, y: 0, text: '' });
      setSelectedElementId(null);
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      panOffsetRef.current = { x: 0, y: 0 };
      zoomScaleRef.current = 1;

      // Persist only the current room session so a browser refresh can stay
      // inside the same room. Explicit Leave clears this data.
      sessionStorage.setItem('studysync_active_session', JSON.stringify({
        roomId: fullCode,
        isHost: Boolean(hostStatus),
        userName: name || '',
        settings: settings || null,
      }));

      setRoomId(fullCode);
      setIsHost(Boolean(hostStatus));
      setIsCoHost(false);
      setUserName(name);
      setUserPermissions({
        canDraw: null,
        canText: null,
        canUpload: null,
        canVoice: null,
        canSharePointer: null,
      });
      setIsSessionActive(true);
      window.history.replaceState({}, '', `?room=${encodeURIComponent(fullCode)}&host=${Boolean(hostStatus)}`);
    } catch (err) {
      console.error('Session launch error:', err);
      alert('Unable to start the session. Please try again.');
    }
  };


  // Browser refresh must NOT send the user back to the home screen. Restore
  // the exact room from the URL/session and let the normal realtime effect
  // reconnect to Supabase. Explicit Leave removes this session first.
  useEffect(() => {
    if (autoRestoreAttemptedRef.current || isSessionActive) return;

    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (!urlRoom) return;

    autoRestoreAttemptedRef.current = true;

    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem('studysync_active_session') || 'null');
    } catch (err) {}

    const restoredRoom = String(urlRoom).trim().toLowerCase();
    const restoredHost = params.get('host') === 'true';
    const roomForRestore = saved?.roomId || restoredRoom;
    const hostForRestore = typeof saved?.isHost === 'boolean' ? saved.isHost : restoredHost;
    const nameForRestore = saved?.userName || (hostForRestore ? 'Host' : 'Guest');

    // A refresh can happen before React has rendered anything. Re-enter the
    // same room automatically instead of showing AuthRoomModal/home.
    handleLaunchSession({
      roomId: roomForRestore,
      isHost: hostForRestore,
      userName: nameForRestore,
      settings: saved?.settings || undefined,
    }).catch((err) => {
      console.error('Room refresh restore failed:', err);
      autoRestoreAttemptedRef.current = false;
    });
  }, [isSessionActive]);

  const completeHostHandoffAndLeave = async (targetClientId) => {
    if (!isHostRef.current || !targetClientId) return;
    const target = participants.find((p) => p.clientId === targetClientId);
    if (!target) return;

    const sent = await safeBroadcast('host-transfer', { newHostId: targetClientId });
    if (!sent) {
      alert('Could not transfer host right now. Please check the room connection and try again.');
      return;
    }

    // Give the selected participant a moment to receive the transfer before
    // this client leaves the realtime channel.
    setIsHost(false);
    isHostRef.current = false;
    setIsCoHost(false);
    isCoHostRef.current = false;
    setCoHostIds([]);
    setShowHostLeaveModal(false);
    setSelectedHostSuccessor('');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await handleLeaveOrDisableRoom(true);
  };

  const handleLeaveOrDisableRoom = async (skipPrompt = false) => {
    leavingRoomRef.current = true;
    if (!skipPrompt && isHostRef.current && participants.length > 1) {
      setSelectedHostSuccessor('');
      setShowHostLeaveModal(true);
      return;
    }
    const isOnlyOne = participants.length <= 1;
    const confirmMsg = isOnlyOne && (isHost || isCoHost)
      ? 'Are you sure you want to disable/delete this room?'
      : 'Are you sure you want to leave this session?';

    const confirmAction = skipPrompt ? true : window.confirm(confirmMsg);
    if (!confirmAction) return;

    // 1. Stop local audio stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setIsMicOn(false);
    setIsVoiceConnected(false);

    // 2. Stop screen recording if running
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // 3. Close all peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};

    // 4. Clean up remote audio elements
    Object.values(remoteAudiosRef.current).forEach((a) => {
      a.srcObject = null;
      try { a.remove(); } catch (err) {}
    });
    remoteAudiosRef.current = {};
    pendingCandidatesRef.current = {};
    makingOfferRef.current = {};

    // 5. Delete room from database if last person left or host/co-host chose to disable
    try {
      if (participants.length <= 1) {
        const fullCode = roomId.trim().toLowerCase();

        // Delete child room data first, then the room itself.
        // This avoids FK/RLS ordering problems and guarantees that private
        // notes cannot survive a deleted room.
        await supabase.from('private_notes').delete().eq('room_id', fullCode);
        await supabase.from('study_rooms').delete().eq('room_id', fullCode);
      }
    } catch (e) {
      console.warn('Deleting room error:', e);
    }

    // 6. Untrack presence & remove channel
    if (channelRef.current) {
      try {
        await channelRef.current.untrack();
      } catch (e) {}
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // 7. Reset session state
    elementsRef.current = [];
    laserPointsRef.current = [];
    currentStrokeRef.current = [];
    setStickyNotes([]);
    setMessages([]);
    setSavedSlides([]);
    setHasDocument(false);
    setSelectedElementId(null);
    setTextInput({ visible: false, x: 0, y: 0, text: '' });
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    panOffsetRef.current = { x: 0, y: 0 };
    zoomScaleRef.current = 1;
    setParticipants([]);
    setRemoteCursors({});
    setIsSessionActive(false);
    setIsCoHost(false);
    setCoHostIds([]);
    setRoomId('');
    try { sessionStorage.removeItem('studysync_active_session'); } catch (err) {}
    autoRestoreAttemptedRef.current = false;
    leavingRoomRef.current = false;
    window.history.replaceState({}, '', window.location.pathname);
  };

  const CANVAS_WIDTH = 4000;
  const CANVAS_HEIGHT = 10000;

  // Real-time Canvas Rendering and Supabase Mesh
  useEffect(() => {
    if (!isSessionActive || !roomId) return;

    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const laserCanvas = laserCanvasRef.current;

    bgCanvas.width = CANVAS_WIDTH;
    bgCanvas.height = CANVAS_HEIGHT;
    drawCanvas.width = CANVAS_WIDTH;
    drawCanvas.height = CANVAS_HEIGHT;
    laserCanvas.width = CANVAS_WIDTH;
    laserCanvas.height = CANVAS_HEIGHT;

    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.fillStyle = '#ffffff';
    bgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    drawCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawCtxRef.current = drawCtx;

    const laserCtx = laserCanvas.getContext('2d');
    laserCtx.lineCap = 'round';
    laserCtx.lineJoin = 'round';
    laserCtxRef.current = laserCtx;

    const channel = supabase.channel(`room-${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: myClientId },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activeList = [];
        Object.keys(state).forEach((key) => {
          const presences = state[key];
          if (presences && presences.length > 0) {
            activeList.push(presences[0]);
          }
        });
        setParticipants(activeList);
        if (!isHostRef.current) {
          safeBroadcast('board-request', { from: myClientId });
        }
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key !== myClientId && isHostRef.current) {
          safeBroadcast('board-state', { to: key, elements: elementsRef.current });
        }
        if (key !== myClientId) {
          createPeerConnection(key);
          if (myClientId < key) {
            setTimeout(() => negotiateWithPeer(key), 50);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setRemoteCursors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        if (voiceRecoveryTimersRef.current[key]) {
          clearTimeout(voiceRecoveryTimersRef.current[key]);
          delete voiceRecoveryTimersRef.current[key];
        }
        if (peerConnectionsRef.current[key]) {
          peerConnectionsRef.current[key].close();
          delete peerConnectionsRef.current[key];
        }
        if (remoteAudiosRef.current[key]) {
          remoteAudiosRef.current[key].srcObject = null;
          delete remoteAudiosRef.current[key];
        }

        const state = channel.presenceState();
        const activeList = [];
        Object.keys(state).forEach((k) => {
          if (k !== key && state[k]?.length > 0) {
            activeList.push(state[k][0]);
          }
        });
        setParticipants(activeList);

        // If this was the LAST participant, remove the room from Supabase.
        // A short delay prevents a false delete during a refresh/reconnect.
        if (activeList.length === 0) {
          const roomToDelete = roomId.trim().toLowerCase();
          setTimeout(async () => {
            try {
              const latestState = channel.presenceState();
              const stillOccupied = Object.keys(latestState).some((k) =>
                latestState[k]?.length > 0
              );
              if (stillOccupied) return;

              await supabase.from('private_notes').delete().eq('room_id', roomToDelete);
              await supabase.from('study_rooms').delete().eq('room_id', roomToDelete);
            } catch (err) {
              console.warn('Empty-room cleanup failed:', err);
            }
          }, 1200);
        }
      })
      // IMPORTANT: drawings are merged by element ID. Replacing the whole
      // array caused one user's drawing to overwrite another user's drawing.
      .on('broadcast', { event: 'board-add' }, ({ payload }) => {
        if (payload?.element) mergeRemoteElements([payload.element]);
      })
      .on('broadcast', { event: 'board-update' }, ({ payload }) => {
        if (payload?.element) mergeRemoteElements([payload.element]);
      })
      .on('broadcast', { event: 'add-element' }, ({ payload }) => {
        if (payload?.element) mergeRemoteElements([payload.element]);
      })
      .on('broadcast', { event: 'board-request' }, ({ payload }) => {
        if (!isHostRef.current || !payload?.from || payload.from === myClientId) return;
        safeBroadcast('board-state', { to: payload.from, elements: elementsRef.current });
      })
      .on('broadcast', { event: 'elements-snapshot-request' }, ({ payload }) => {
        if (!isHostRef.current || !payload?.from || payload.from === myClientId) return;
        safeBroadcast('board-state', { to: payload.from, elements: elementsRef.current });
      })
      .on('broadcast', { event: 'board-state' }, ({ payload }) => {
        if (payload?.to && payload.to !== myClientId) return;
        mergeRemoteElements(payload?.elements || []);
      })
      .on('broadcast', { event: 'elements-snapshot' }, ({ payload }) => {
        if (payload?.to && payload.to !== myClientId) return;
        mergeRemoteElements(payload?.elements || []);
      })
      // Compatibility with an older tab still using sync-elements.
      .on('broadcast', { event: 'sync-elements' }, ({ payload }) => {
        mergeRemoteElements(payload?.elements || []);
      })
      .on('broadcast', { event: 'draw-laser' }, ({ payload }) => addLaserPoint(payload.x, payload.y))
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => setMessages((prev) => [...prev, payload]))
      .on('broadcast', { event: 'sync-stickies' }, ({ payload }) => setStickyNotes(payload.stickies))
      .on('broadcast', { event: 'board-clear' }, () => {
        elementsRef.current = [];
        redrawCanvas();
      })
      .on('broadcast', { event: 'clear-board' }, () => {
        elementsRef.current = [];
        redrawCanvas();
      })
      .on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
        if (!payload?.clientId || payload.clientId === myClientId) return;
        setRemoteCursors((prev) => ({ ...prev, [payload.clientId]: payload }));
      })
      .on('broadcast', { event: 'permissions-update' }, ({ payload }) => {
        const next = { ...permissionsRef.current, ...(payload || {}) };
        permissionsRef.current = next;
        setPermissions(next);
        if (next.canVoiceChat === false && localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => { track.enabled = false; });
          setIsMicOn(false);
          setIsVoiceConnected(false);
        }
      })
      .on('broadcast', { event: 'individual-permission-update' }, ({ payload }) => {
        if (payload?.targetClientId !== myClientId) return;
        const next = {
          canDraw: null,
          canText: null,
          canUpload: null,
          canVoice: null,
          ...(payload.permissions || {}),
        };
        setUserPermissions(next);
        if (next.canVoice === false && localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => { track.enabled = false; });
          setIsMicOn(false);
          setIsVoiceConnected(false);
        }
      })
      .on('broadcast', { event: 'cohost-update' }, ({ payload }) => {
        setCoHostIds(payload.coHostIds || []);
        if (payload.coHostIds?.includes(myClientId)) {
          setIsCoHost(true);
        } else {
          setIsCoHost(false);
        }
      })
      .on('broadcast', { event: 'kick-participant' }, ({ payload }) => {
        if (payload?.targetClientId !== myClientId) return;
        alert('You were removed from this room by the host.');
        setIsSessionActive(false);
        setIsMicOn(false);
        setIsVoiceConnected(false);
        setRoomId('');
        setParticipants([]);
        setIsCoHost(false);
        setCoHostIds([]);
        try { sessionStorage.removeItem('studysync_active_session'); } catch (err) {}
        window.history.replaceState({}, '', window.location.pathname);
      })
      .on('broadcast', { event: 'host-transfer' }, ({ payload }) => {
        const newHostId = payload?.newHostId;
        if (!newHostId) return;
        const becomingHost = newHostId === myClientId;
        setIsHost(becomingHost);
        isHostRef.current = becomingHost;
        setIsCoHost(false);
        isCoHostRef.current = false;
        if (newHostId === myClientId) {
          setUserPermissions((prev) => { const next = { ...prev, canDraw: true, canText: true, canUpload: true, canVoice: true, canSharePointer: true }; userPermissionsRef.current = next; return next; });
          setTimeout(() => {
            channelRef.current?.track({
              clientId: myClientId,
              userName,
              isHost: true,
              isCoHost: false,
              isMicOn,
              joinedAt: new Date().toISOString(),
            });
          }, 50);
        }
      })
      .on('broadcast', { event: 'sync-view' }, ({ payload }) => {
        if (payload.scale !== undefined) setZoomScale(payload.scale);
        if (payload.pan !== undefined) setPanOffset(payload.pan);
      })
      .on('broadcast', { event: 'load-doc' }, ({ payload }) => {
        renderImageOnCanvas(payload.dataUrl);
        if (payload.page) setPageNum(payload.page);
        if (payload.total) setNumPages(payload.total);
      })
      .on('broadcast', { event: 'delete-doc' }, () => resetBackgroundCanvas(false))
      .on('broadcast', { event: 'webrtc-renegotiate-request' }, ({ payload }) => {
        const fromPeerId = payload?.from;
        if (!fromPeerId || fromPeerId === myClientId) return;
        const pc = peerConnectionsRef.current[fromPeerId];
        if (!pc || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          createPeerConnection(fromPeerId);
        }
        if (myClientId < fromPeerId) {
          setTimeout(() => negotiateWithPeer(fromPeerId), 80);
        }
      })
      .on('broadcast', { event: 'webrtc-offer' }, async ({ payload }) => {
        if (payload.to !== myClientId) return;
        handleReceiveOffer(payload.from, payload.offer);
      })
      .on('broadcast', { event: 'webrtc-answer' }, async ({ payload }) => {
        if (payload.to !== myClientId) return;
        const pc = peerConnectionsRef.current[payload.from];
        if (!pc) return;

        try {
          if (pc.signalingState !== 'have-local-offer') return;
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          await flushPendingCandidates(payload.from, pc);
          Object.values(remoteAudiosRef.current).forEach((audioEl) => {
            if (audioEl?.srcObject) audioEl.play().catch(() => {});
          });
        } catch (err) {
          console.warn('WebRTC answer error:', err);
        }
      })
      .on('broadcast', { event: 'webrtc-candidate' }, async ({ payload }) => {
        if (payload.to !== myClientId || !payload.candidate) return;

        const pc = peerConnectionsRef.current[payload.from] || createPeerConnection(payload.from);

        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            pendingCandidatesRef.current[payload.from] =
              pendingCandidatesRef.current[payload.from] || [];
            pendingCandidatesRef.current[payload.from].push(payload.candidate);
          }
        } catch (err) {
          console.warn('ICE candidate error:', err);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channelReadyRef.current = true;
          await channel.track({
            clientId: myClientId,
            userName: userName || (isHost ? 'Host' : 'Guest'),
            isHost,
            isCoHost,
            isMicOn: Boolean(localStreamRef.current?.getAudioTracks()?.[0]?.enabled),
            joinedAt: new Date().toISOString(),
            permissions: userPermissions,
          });

          await flushBoardOutbox();
          if (!isHostRef.current) {
            setTimeout(() => safeBroadcast('board-request', { from: myClientId }), 150);
          }

          // Presence sync can contain peers that joined before this client.
          // The smaller client ID is the sole offer initiator.
          const state = channel.presenceState();
          Object.keys(state).forEach((peerId) => {
            if (peerId !== myClientId) {
              createPeerConnection(peerId);
              if (myClientId < peerId) {
                setTimeout(() => negotiateWithPeer(peerId), 50);
              }
            }
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channelReadyRef.current = false;
      if (channelRef.current === channel) channelRef.current = null;
      supabase.removeChannel(channel);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.values(voiceRecoveryTimersRef.current).forEach((timer) => clearTimeout(timer));
      voiceRecoveryTimersRef.current = {};
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
      Object.values(remoteAudiosRef.current).forEach((a) => {
        a.srcObject = null;
        try { a.remove(); } catch (err) {}
      });
      remoteAudiosRef.current = {};
      pendingCandidatesRef.current = {};
      makingOfferRef.current = {};
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isSessionActive, roomId]);

  // Laser Pen Animation Loop
  useEffect(() => {
    if (!isSessionActive) return;
    let animId;
    const LASER_LIFESPAN = 1500;

    const renderLaser = () => {
      const ctx = laserCtxRef.current;
      const canvas = laserCanvasRef.current;
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();

      laserPointsRef.current = laserPointsRef.current.filter((p) => now - p.time < LASER_LIFESPAN);

      const pts = laserPointsRef.current;
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        if (p2.isStart) continue;

        const age = now - p2.time;
        const opacity = Math.max(0, 1 - age / LASER_LIFESPAN);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(239, 68, 68, ${opacity})`;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      animId = requestAnimationFrame(renderLaser);
    };

    animId = requestAnimationFrame(renderLaser);
    return () => cancelAnimationFrame(animId);
  }, [isSessionActive]);

  const addLaserPoint = (x, y, isStart = false) => {
    laserPointsRef.current.push({ x, y, time: Date.now(), isStart });
  };

  const redrawCanvas = () => {
    const ctx = drawCtxRef.current;
    const canvas = drawCanvasRef.current;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    elementsRef.current.forEach((el) => {
      ctx.save();
      if (el.isHighlighter) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.width * 5;
        ctx.lineCap = 'square';
      } else if (el.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = el.width * 6;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = el.color;
        ctx.fillStyle = el.color;
        ctx.lineWidth = el.width;
        ctx.lineCap = 'round';
      }

      if (el.type === 'stroke' && el.points && el.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      } else if (el.type === 'shape') {
        drawShapeDirect(ctx, el.shapeTool, el.fromX, el.fromY, el.toX, el.toY);
      } else if (el.type === 'text') {
        ctx.font = `700 ${el.fontSize}px Inter, sans-serif`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(el.text, el.x, el.y);
      }

      if (toolRef.current === 'select' && selectedElementId === el.id) {
        const bounds = getElementBounds(el);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
      }
      ctx.restore();
    });
  };

  const broadcastElement = (element) => {
    if (!element) return;
    safeBroadcast('board-add', { element }, { queue: true });
  };

  const broadcastUpdatedElement = (element) => {
    if (!element) return;
    safeBroadcast('board-update', { element }, { queue: true });
  };

  const broadcastAllElements = () => {
    // Kept only for compatibility with existing text/select actions.
    // Normal drawing never sends a whole-board replacement anymore.
    safeBroadcast('board-state', { to: null, elements: elementsRef.current });
  };

  const getElementBounds = (el) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    if (el.type === 'stroke' && el.points) {
      el.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
    } else if (el.type === 'shape') {
      if (el.shapeTool === 'circle' || el.shapeTool === 'star') {
        const radius = Math.hypot(el.toX - el.fromX, el.toY - el.fromY);
        minX = el.fromX - radius;
        maxX = el.fromX + radius;
        minY = el.fromY - radius;
        maxY = el.fromY + radius;
      } else {
        minX = Math.min(el.fromX, el.toX);
        maxX = Math.max(el.fromX, el.toX);
        minY = Math.min(el.fromY, el.toY);
        maxY = Math.max(el.fromY, el.toY);
      }
    } else if (el.type === 'text') {
      minX = el.x;
      const charWidth = (el.fontSize || 24) * 0.62;
      maxX = el.x + ((el.text?.length || 1) * charWidth);
      minY = el.y - (el.fontSize || 24);
      maxY = el.y + 6;
    }

    const pad = Math.max((el.width || 4) / 2, 8);
    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minY: minY - pad,
      maxY: maxY + pad,
      width: Math.max((maxX - minX) + pad * 2, 16),
      height: Math.max((maxY - minY) + pad * 2, 16),
    };
  };

  const isPointInsideElement = (x, y, el) => {
    const b = getElementBounds(el);
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  };

  const moveElementByDelta = (el, dx, dy) => {
    if (el.type === 'stroke' && el.points) {
      el.points = el.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    } else if (el.type === 'shape') {
      el.fromX += dx;
      el.fromY += dy;
      el.toX += dx;
      el.toY += dy;
    } else if (el.type === 'text') {
      el.x += dx;
      el.y += dy;
    }
  };

  useEffect(() => {
    if (!isSessionActive) return;

    const handleWheel = (e) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
        const newScale = Math.min(Math.max(Number((zoomScaleRef.current * zoomFactor).toFixed(2)), 0.3), 3.0);
        setZoomScale(newScale);

        if ((isHost || isCoHost) && permissions.syncZoomGlobally) {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'sync-view',
            payload: { scale: newScale, pan: panOffsetRef.current },
          });
        }
      } else {
        const newPan = {
          x: panOffsetRef.current.x - e.deltaX,
          y: panOffsetRef.current.y - e.deltaY,
        };
        setPanOffset(newPan);

        if ((isHost || isCoHost) && permissions.syncZoomGlobally) {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'sync-view',
            payload: { pan: newPan, scale: zoomScaleRef.current },
          });
        }
      }
    };

    const viewport = viewportRef.current;
    if (viewport) {
      viewport.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (viewport) viewport.removeEventListener('wheel', handleWheel);
    };
  }, [isHost, isCoHost, permissions.syncZoomGlobally, isSessionActive]);

  useEffect(() => {
    if (!drawCtxRef.current) return;
    const ctx = drawCtxRef.current;

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = lineWidth * 6;
      ctx.lineCap = 'round';
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color === '#0f172a' ? '#facc15' : color;
      ctx.lineWidth = lineWidth * 5;
      ctx.lineCap = 'square';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
    }
  }, [color, lineWidth, tool]);

  const startRecording = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true,
      });

      let audioStream;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {}

      const tracks = [...screenStream.getVideoTracks()];
      if (audioStream && audioStream.getAudioTracks().length > 0) {
        tracks.push(audioStream.getAudioTracks()[0]);
      } else if (screenStream.getAudioTracks().length > 0) {
        tracks.push(screenStream.getAudioTracks()[0]);
      }

      const combinedStream = new MediaStream(tracks);
      recordedChunksRef.current = [];

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `StudySync-${roomId}-Lecture.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        combinedStream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        setRecordingSeconds(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      screenStream.getVideoTracks()[0].onended = () => stopRecording();

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Screen recording cancelled or not supported.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const formatRecordingTime = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const addStickyNote = (x, y) => {
    const newSticky = {
      id: Date.now(),
      x,
      y,
      text: 'Note...',
      bgColor: '#fef08a',
    };
    const updated = [...stickyNotes, newSticky];
    setStickyNotes(updated);
    broadcastStickies(updated);
    setTool('pencil');
  };

  const updateStickyText = (id, newText) => {
    const updated = stickyNotes.map((s) => (s.id === id ? { ...s, text: newText } : s));
    setStickyNotes(updated);
    broadcastStickies(updated);
  };

  const deleteStickyNote = (id) => {
    const updated = stickyNotes.filter((s) => s.id !== id);
    setStickyNotes(updated);
    broadcastStickies(updated);
  };

  const broadcastStickies = (stickies) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sync-stickies',
      payload: { stickies },
    });
  };

  // Magic / Auto-correct Pen.
  // The recognizer works from the complete freehand path, so the temporary
  // preview is never used as the stored board state. It recognizes lines,
  // arrows, circles, rectangles and triangles and otherwise keeps the exact
  // freehand stroke.
  const recognizeAndDrawSmartShape = (rawPoints, shouldBroadcast = true) => {
    if (!Array.isArray(rawPoints) || rawPoints.length < 6) return false;

    const points = rawPoints
      .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
    if (points.length < 6) return false;

    const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const pathLength = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
    if (pathLength < 18) return false;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    const diagonal = Math.hypot(boxW, boxH);
    if (diagonal < 12) return false;

    const first = points[0];
    const last = points[points.length - 1];
    const endDistance = distance(first, last);
    const closed = endDistance <= Math.max(18, diagonal * 0.24);

    const makeShape = (shapeTool, fromX, fromY, toX, toY) => {
      const now = Date.now();
      return {
        id: makeElementId(`magic-${shapeTool}`),
        type: 'shape',
        shapeTool,
        fromX,
        fromY,
        toX,
        toY,
        color: colorRef.current,
        width: lineWidthRef.current,
        createdAt: now,
        updatedAt: now,
      };
    };

    const commitShape = (el) => {
      elementsRef.current.push(el);
      redrawCanvas();
      // A guest without Draw permission keeps the drawing locally on their
      // own board, but it must not be sent to the shared room board.
      if (shouldBroadcast) broadcastElement(el);
      return true;
    };

    // Ramer-Douglas-Peucker simplification for corner detection.
    const perpendicularDistance = (point, a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) return distance(point, a);
      return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / Math.hypot(dx, dy);
    };

    const simplify = (pts, epsilon) => {
      if (pts.length < 3) return pts;
      let maxDist = 0;
      let index = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const d = perpendicularDistance(pts[i], pts[0], pts[pts.length - 1]);
        if (d > maxDist) { maxDist = d; index = i; }
      }
      if (maxDist > epsilon) {
        const left = simplify(pts.slice(0, index + 1), epsilon);
        const right = simplify(pts.slice(index), epsilon);
        return left.slice(0, -1).concat(right);
      }
      return [pts[0], pts[pts.length - 1]];
    };

    // 1) Circle: closed path + near-uniform radius around its center.
    if (closed && boxW > 20 && boxH > 20) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const radii = points.map((p) => Math.hypot(p.x - centerX, p.y - centerY));
      const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
      const meanError = radii.reduce((sum, r) => sum + Math.abs(r - avgRadius), 0) / radii.length;
      const aspect = Math.min(boxW, boxH) / Math.max(boxW, boxH);
      if (avgRadius > 10 && aspect > 0.65 && meanError / avgRadius < 0.22) {
        return commitShape(makeShape('circle', centerX, centerY, centerX + avgRadius, centerY));
      }
    }

    // 2) Straight line / arrow. First simplify the path so hand jitter does
    // not prevent recognition.
    const simplifiedOpen = simplify(points, Math.max(3, diagonal * 0.035));
    const direct = distance(first, last);
    const straightness = direct / pathLength;

    if (direct > 28 && straightness > 0.88) {
      return commitShape(makeShape('line', first.x, first.y, last.x, last.y));
    }

    // Arrow: open path with a long shaft and a compact V-shaped head.
    // Find the point farthest from the starting point; that is normally the
    // arrow tip even when the user finishes by drawing one side of the head.
    let tipIndex = 0;
    let maxFromStart = 0;
    for (let i = 1; i < points.length; i++) {
      const d = distance(first, points[i]);
      if (d > maxFromStart) { maxFromStart = d; tipIndex = i; }
    }

    if (!closed && maxFromStart > 30 && tipIndex > 1 && tipIndex < points.length - 2) {
      const tip = points[tipIndex];
      const headSpan = Math.max(10, diagonal * 0.18);
      const beforeTip = points[Math.max(0, tipIndex - Math.floor(points.length * 0.08))];
      const afterTip = points[Math.min(points.length - 1, tipIndex + Math.floor(points.length * 0.08))];
      const shaftAngle = Math.atan2(tip.y - first.y, tip.x - first.x);
      const leftAngle = Math.atan2(beforeTip.y - tip.y, beforeTip.x - tip.x);
      const rightAngle = Math.atan2(afterTip.y - tip.y, afterTip.x - tip.x);
      let d1 = Math.abs(leftAngle - shaftAngle);
      let d2 = Math.abs(rightAngle - shaftAngle);
      if (d1 > Math.PI) d1 = 2 * Math.PI - d1;
      if (d2 > Math.PI) d2 = 2 * Math.PI - d2;
      const hasHeadTurn = d1 > 0.45 || d2 > 0.45;
      const compactHead = distance(beforeTip, tip) < headSpan && distance(afterTip, tip) < headSpan;
      if (hasHeadTurn && compactHead) {
        return commitShape(makeShape('arrow', first.x, first.y, tip.x, tip.y));
      }
    }

    // 3) Closed polygons. Simplify aggressively enough to ignore hand shake,
    // but not so aggressively that a triangle becomes a line.
    if (closed && boxW > 18 && boxH > 18) {
      const simplified = simplify(points, Math.max(4, diagonal * 0.055));
      const corners = simplified.length - 1; // last point closes the first
      const aspect = Math.min(boxW, boxH) / Math.max(boxW, boxH);

      if (corners === 3 && aspect > 0.30) {
        return commitShape(makeShape('triangle', minX, minY, maxX, maxY));
      }
      if (corners === 4 && aspect > 0.20) {
        return commitShape(makeShape('rectangle', minX, minY, maxX, maxY));
      }
    }

    return false;
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMsg = {
      id: Date.now(),
      sender: `${isHost || isCoHost ? '👑 ' : '👤 '}${userName || (isHost ? 'Host' : 'Guest')}`,
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: newMsg,
    });
    setChatInput('');
  };

  const captureBoardSnapshot = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!bgCanvas || !drawCanvas) return;

    const merged = document.createElement('canvas');
    merged.width = window.innerWidth;
    merged.height = window.innerHeight;
    const mCtx = merged.getContext('2d');

    mCtx.drawImage(bgCanvas, -panOffset.x / zoomScale, -panOffset.y / zoomScale, window.innerWidth / zoomScale, window.innerHeight / zoomScale, 0, 0, window.innerWidth, window.innerHeight);
    mCtx.drawImage(drawCanvas, -panOffset.x / zoomScale, -panOffset.y / zoomScale, window.innerWidth / zoomScale, window.innerHeight / zoomScale, 0, 0, window.innerWidth, window.innerHeight);

    const dataUrl = merged.toDataURL('image/png');
    const newSlide = {
      id: Date.now(),
      title: `Slide ${savedSlides.length + 1}`,
      dataUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setSavedSlides((prev) => [...prev, newSlide]);
    setSnapNotice(true);
    setTimeout(() => setSnapNotice(false), 2000);
  };

  const exportSlidesToPdf = () => {
    if (savedSlides.length === 0) {
      alert('No slides captured!');
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF generation engine loading...');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [window.innerWidth, window.innerHeight] });

    savedSlides.forEach((slide, index) => {
      if (index > 0) doc.addPage([window.innerWidth, window.innerHeight], 'landscape');
      doc.addImage(slide.dataUrl, 'PNG', 0, 0, window.innerWidth, window.innerHeight);
    });

    doc.save(`StudySync-${roomId}-Lectures.pdf`);
  };

  const updateHostPermission = (key, value) => {
    if (!isHost) return;
    const updated = { ...permissions, [key]: value };
    setPermissions(updated);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'permissions-update',
      payload: updated,
    });
  };

  const toggleCoHostStatus = (targetClientId) => {
    if (!isHost || targetClientId === myClientId) return;
    let updatedCoHosts = [...coHostIds];
    if (updatedCoHosts.includes(targetClientId)) {
      updatedCoHosts = updatedCoHosts.filter((id) => id !== targetClientId);
    } else {
      updatedCoHosts.push(targetClientId);
    }
    setCoHostIds(updatedCoHosts);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'cohost-update',
      payload: { coHostIds: updatedCoHosts },
    });
  };

  const updateParticipantOverride = (targetClientId, permKey, value) => {
    if (!isHost || targetClientId === myClientId) return;
    const current = participantOverrides[targetClientId] || {
      canDraw: null,
      canText: null,
      canUpload: null,
      canVoice: null,
      canSharePointer: null,
    };
    const updatedForPeer = { ...current, [permKey]: value };
    setParticipantOverrides((prev) => ({ ...prev, [targetClientId]: updatedForPeer }));
    channelRef.current?.send({
      type: 'broadcast',
      event: 'individual-permission-update',
      payload: { targetClientId, permissions: updatedForPeer },
    });
  };

  const kickParticipant = (targetClientId) => {
    if (!isHost || targetClientId === myClientId) return;
    const target = participants.find((p) => p.clientId === targetClientId);
    if (!target) return;
    if (!window.confirm(`Remove ${target.userName || 'this participant'} from the room?`)) return;

    channelRef.current?.send({
      type: 'broadcast',
      event: 'kick-participant',
      payload: { targetClientId },
    });
  };

  const transferHost = (targetClientId) => {
    if (!isHost || targetClientId === myClientId) return;
    const target = participants.find((p) => p.clientId === targetClientId);
    if (!target) return;
    if (!window.confirm(`Make ${target.userName || 'this participant'} the new host?`)) return;

    channelRef.current?.send({
      type: 'broadcast',
      event: 'host-transfer',
      payload: { newHostId: targetClientId },
    });

    setIsHost(false);
    setIsCoHost(false);
    setCoHostIds([]);
    channelRef.current?.track({
      clientId: myClientId,
      userName,
      isHost: false,
      isCoHost: false,
      isMicOn,
      permissions: userPermissions,
    });
  };

  const handleZoom = (delta) => {
    const newScale = Math.min(Math.max(Number((zoomScaleRef.current + delta).toFixed(2)), 0.3), 3.0);
    setZoomScale(newScale);
    if (isHost && permissions.syncZoomGlobally) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'sync-view',
        payload: { scale: newScale, pan: panOffsetRef.current },
      });
    }
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    panOffsetRef.current = { x: 0, y: 0 };
    zoomScaleRef.current = 1;
    if (isHost && permissions.syncZoomGlobally) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'sync-view',
        payload: { scale: 1, pan: { x: 0, y: 0 } },
      });
    }
  };

  const ensureRemoteAudio = (peerId, stream) => {
    let audioEl = remoteAudiosRef.current[peerId];

    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.controls = false;
      audioEl.muted = false;
      audioEl.volume = 1;
      audioEl.setAttribute('aria-hidden', 'true');
      audioEl.style.position = 'fixed';
      audioEl.style.width = '1px';
      audioEl.style.height = '1px';
      audioEl.style.opacity = '0';
      audioEl.style.pointerEvents = 'none';
      document.body.appendChild(audioEl);
      remoteAudiosRef.current[peerId] = audioEl;
    }

    audioEl.srcObject = stream;
    const tryPlay = () => {
      if (audioEl.srcObject) audioEl.play().catch(() => {});
    };
    audioEl.onloadedmetadata = tryPlay;
    audioEl.oncanplay = tryPlay;
    stream.getAudioTracks().forEach((track) => {
      track.onunmute = tryPlay;
    });
    tryPlay();
    // A few browsers delay remote audio until the media pipeline becomes
    // active. Retry briefly without requiring another mic click.
    [100, 300, 700, 1500].forEach((delay) => setTimeout(tryPlay, delay));
  };

  const flushPendingCandidates = async (peerId, pc) => {
    const pending = pendingCandidatesRef.current[peerId] || [];
    if (!pc.remoteDescription) return;

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('ICE candidate error:', err);
      }
    }
    delete pendingCandidatesRef.current[peerId];
  };

  const createPeerConnection = (targetPeerId) => {
    if (!targetPeerId || targetPeerId === myClientId) return null;

    const existing = peerConnectionsRef.current[targetPeerId];
    if (existing && existing.connectionState !== 'closed') return existing;

    const pc = new RTCPeerConnection(rtcConfig);
    pendingCandidatesRef.current[targetPeerId] = pendingCandidatesRef.current[targetPeerId] || [];

    pc.onicecandidate = (event) => {
      if (!event.candidate || !channelReadyRef.current) return;
      channelRef.current?.send({
        type: 'broadcast',
        event: 'webrtc-candidate',
        payload: {
          from: myClientId,
          to: targetPeerId,
          candidate: event.candidate,
        },
      });
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      ensureRemoteAudio(targetPeerId, stream);
    };

    pc.onconnectionstatechange = () => {
      const connectedPeerExists = Object.entries(peerConnectionsRef.current).some(
        ([peerId, connection]) =>
          peerId !== targetPeerId && connection?.connectionState === 'connected'
      ) || pc.connectionState === 'connected';

      setIsVoiceConnected(connectedPeerExists);

      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Mobile networks/Wi-Fi can briefly disconnect ICE. Do not destroy a
        // healthy connection immediately; rebuild it only if it stays broken.
        if (!voiceRecoveryTimersRef.current[targetPeerId]) {
          const delay = pc.connectionState === 'failed' ? 500 : 2000;
          voiceRecoveryTimersRef.current[targetPeerId] = setTimeout(() => {
            delete voiceRecoveryTimersRef.current[targetPeerId];

            if (peerConnectionsRef.current[targetPeerId] !== pc) return;
            if (pc.connectionState === 'connected' || pc.connectionState === 'connecting') return;

            try { pc.close(); } catch (err) {}
            delete peerConnectionsRef.current[targetPeerId];
            delete makingOfferRef.current[targetPeerId];
            delete pendingCandidatesRef.current[targetPeerId];

            if (remoteAudiosRef.current[targetPeerId]) {
              remoteAudiosRef.current[targetPeerId].srcObject = null;
            }

            // Ask the deterministic initiator (smaller client id) to create
            // a fresh offer. This works even if only the receiver noticed the
            // network failure.
            createPeerConnection(targetPeerId);
            channelRef.current?.send({
              type: 'broadcast',
              event: 'webrtc-renegotiate-request',
              payload: { from: myClientId },
            });
            if (myClientId < targetPeerId) {
              setTimeout(() => negotiateWithPeer(targetPeerId), 150);
            }
          }, delay);
        }
      }

      if (pc.connectionState === 'closed') {
        if (voiceRecoveryTimersRef.current[targetPeerId]) {
          clearTimeout(voiceRecoveryTimersRef.current[targetPeerId]);
          delete voiceRecoveryTimersRef.current[targetPeerId];
        }
        if (peerConnectionsRef.current[targetPeerId] === pc) {
          delete peerConnectionsRef.current[targetPeerId];
        }
        delete makingOfferRef.current[targetPeerId];
      }
    };

    // One permanent audio m-line per peer. It stays sendrecv even when the
    // local mic is OFF, so either side can receive audio immediately.
    let audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.__studysyncAudioTransceiver = audioTransceiver;

    const localTrack = localStreamRef.current?.getAudioTracks?.()[0];
    if (localTrack && audioTransceiver.sender) {
      audioTransceiver.sender.replaceTrack(localTrack).catch((err) => {
        console.warn('Initial audio track attach failed:', err);
      });
    }

    peerConnectionsRef.current[targetPeerId] = pc;
    return pc;
  };

  const negotiateWithPeer = async (targetPeerId) => {
    if (!targetPeerId || targetPeerId === myClientId) return;
    // Smaller client ID is the only offer initiator. This removes offer/offer
    // collisions when two people join or toggle their microphones together.
    if (myClientId > targetPeerId) return;

    const pc = createPeerConnection(targetPeerId);
    if (!pc || pc.connectionState === 'closed') return;
    if (makingOfferRef.current[targetPeerId]) return;
    if (pc.signalingState !== 'stable') return;

    makingOfferRef.current[targetPeerId] = true;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!pc.localDescription) return;

      channelRef.current?.send({
        type: 'broadcast',
        event: 'webrtc-offer',
        payload: {
          from: myClientId,
          to: targetPeerId,
          offer: pc.localDescription,
        },
      });
    } catch (err) {
      console.warn('WebRTC offer error:', err);
    } finally {
      makingOfferRef.current[targetPeerId] = false;
    }
  };

  const handleReceiveOffer = async (fromPeerId, offer) => {
    if (!fromPeerId || fromPeerId === myClientId || !offer) return;
    // Larger ID is the answerer only.
    if (myClientId < fromPeerId) return;

    try {
      const pc = createPeerConnection(fromPeerId);
      if (!pc) return;

      if (pc.signalingState !== 'stable') {
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(fromPeerId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      channelRef.current?.send({
        type: 'broadcast',
        event: 'webrtc-answer',
        payload: {
          from: myClientId,
          to: fromPeerId,
          answer: pc.localDescription,
        },
      });
    } catch (err) {
      console.warn('WebRTC offer handling error:', err);
    }
  };

  const requestVoiceNegotiation = () => {
    // Tell every peer that the audio sender state may have changed.
    channelRef.current?.send({
      type: 'broadcast',
      event: 'webrtc-renegotiate-request',
      payload: { from: myClientId },
    });

    participants.forEach((peer) => {
      const peerId = peer?.clientId;
      if (!peerId || peerId === myClientId) return;
      if (myClientId < peerId) {
        negotiateWithPeer(peerId);
      }
    });
  };

  const startVoiceChat = async () => {
    if (!canUserVoice) {
      alert('Microphone permission is disabled. Ask the host.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Microphone is not available in this browser. Use HTTPS or localhost.');
      return;
    }

    try {
      if (!localStreamRef.current) {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }

      const stream = localStreamRef.current;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) throw new Error('No microphone audio track was created.');
      audioTrack.enabled = true;

      // Attach the SAME microphone track to exactly one sender per peer.
      for (const peer of participants) {
        const peerId = peer?.clientId;
        if (!peerId || peerId === myClientId) continue;

        const pc = createPeerConnection(peerId);
        if (!pc) continue;

        const transceiver = pc.__studysyncAudioTransceiver || pc.getTransceivers().find(
          (t) => t.receiver?.track?.kind === 'audio'
        );

        if (transceiver?.sender) {
          await transceiver.sender.replaceTrack(audioTrack);
        }
      }

      setIsMicOn(true);
      setIsVoiceConnected(
        Object.values(peerConnectionsRef.current).some((pc) => pc?.connectionState === 'connected')
      );

      await channelRef.current?.track({
        clientId: myClientId,
        userName: userName || (isHost ? 'Host' : 'Guest'),
        isHost,
        isCoHost,
        isMicOn: true,
        permissions: userPermissions,
      });

      // This also handles peers who joined before/after the mic was enabled.
      participants.forEach((peer) => {
        if (peer?.clientId && peer.clientId !== myClientId) {
          createPeerConnection(peer.clientId);
        }
      });
      requestVoiceNegotiation();
    } catch (err) {
      console.error('Microphone access error:', err);
      alert('Microphone access denied or unavailable. Check browser microphone permission.');
    }
  };

  const toggleMic = async () => {
    if (!canUserVoice) {
      alert('Microphone permission disabled.');
      return;
    }

    if (!localStreamRef.current) {
      await startVoiceChat();
      return;
    }

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) {
      await startVoiceChat();
      return;
    }

    const newEnabled = !audioTrack.enabled;
    audioTrack.enabled = newEnabled;
    setIsMicOn(newEnabled);

    // Keep presence in sync so every participant sees the correct mic state.
    await channelRef.current?.track({
      clientId: myClientId,
      userName: userName || (isHost ? 'Host' : 'Guest'),
      isHost,
      isCoHost,
      isMicOn: newEnabled,
      permissions: userPermissions,
    });

    if (newEnabled) {
      // Track is already attached to every peer's sender. Renegotiation makes
      // sure a peer that joined while our mic was off receives it too.
      requestVoiceNegotiation();
    }
  };

  useEffect(() => {
    if (textInput.visible && textInputRef.current) {
      setTimeout(() => textInputRef.current.focus(), 50);
    }
  }, [textInput.visible]);

  const renderImageOnCanvas = (dataUrl) => {
    const img = new Image();
    img.onload = () => {
      const bgCanvas = bgCanvasRef.current;
      const bgCtx = bgCanvas.getContext('2d');
      bgCtx.fillStyle = '#ffffff';
      bgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const x = Math.max(60, (window.innerWidth - img.width) / 2);
      bgCtx.drawImage(img, x, 40);
      setHasDocument(true);
    };
    img.src = dataUrl;
  };

  // Load the two browser-side engines on demand so PDF upload and the
  // Extract -> Private Study Notes workflow work even when index.html does not
  // already include their CDN script tags.
  const loadExternalScript = (src, globalName) => new Promise((resolve, reject) => {
    if (window[globalName]) { resolve(window[globalName]); return; }
    const existing = document.querySelector(`script[data-studysync-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window[globalName]));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.studysyncSrc = src;
    script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error(`${globalName} did not load`));
    script.onerror = () => reject(new Error(`Failed to load ${globalName}`));
    document.head.appendChild(script);
  });

  const ensurePdfJs = () => loadExternalScript(
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'pdfjsLib'
  );

  const ensureTesseract = () => loadExternalScript(
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'Tesseract'
  );

  const ensureJsPdf = () => loadExternalScript(
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'jspdf'
  );

  useEffect(() => {
    if (!isSessionActive) return;
    // Preload quietly; the actual buttons still show a useful error if a CDN
    // is blocked/offline.
    ensurePdfJs().catch(() => {});
    ensureTesseract().catch(() => {});
    ensureJsPdf().catch(() => {});
  }, [isSessionActive]);

  const renderPdfSinglePage = async (pdf, targetPage, broadcast = true) => {
    try {
      const page = await pdf.getPage(targetPage);
      const viewport = page.getViewport({ scale: 1.4 });
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.height = viewport.height;
      tempCanvas.width = viewport.width;

      await page.render({ canvasContext: tempCtx, viewport }).promise;
      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);

      renderImageOnCanvas(dataUrl);

      if (broadcast) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'load-doc',
          payload: { dataUrl, page: targetPage, total: pdf.numPages },
        });
      }
    } catch (err) {}
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!canUserUpload) {
      alert('File/PDF upload permission is disabled. Ask the host to allow Upload.');
      e.target.value = '';
      return;
    }

    if (file.type === 'application/pdf') {
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        try {
          const pdfjs = await ensurePdfJs();
          pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf = await pdfjs.getDocument({ data: typedarray }).promise;
          pdfDocRef.current = pdf;
          setNumPages(pdf.numPages);
          setPageNum(1);
          await renderPdfSinglePage(pdf, 1, true);
        } catch (err) {
          console.error('PDF load error:', err);
          alert('Could not open this PDF. Check your internet connection and try again.');
        }
      };
      fileReader.readAsArrayBuffer(file);
    } else {
      pdfDocRef.current = null;
      setNumPages(0);
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        renderImageOnCanvas(dataUrl);
        channelRef.current?.send({
          type: 'broadcast',
          event: 'load-doc',
          payload: { dataUrl, page: 1, total: 1 },
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const changePdfPage = (direction) => {
    if (!pdfDocRef.current) return;
    const newPage = pageNum + direction;
    if (newPage >= 1 && newPage <= numPages) {
      setPageNum(newPage);
      renderPdfSinglePage(pdfDocRef.current, newPage, true);
    }
  };

  const resetBackgroundCanvas = (broadcast = true) => {
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return;
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.fillStyle = '#ffffff';
    bgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    setHasDocument(false);
    pdfDocRef.current = null;
    setNumPages(0);
    setPageNum(1);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (broadcast) {
      channelRef.current?.send({ type: 'broadcast', event: 'delete-doc' });
    }
  };

  useEffect(() => {
    if (!isSessionActive || !roomId) return;
    const loadPrivateNotes = async () => {
      const storageKey = `studysync_notes_${roomId}_${userName || 'user'}`;
      const cached = localStorage.getItem(storageKey);
      if (cached) setPrivateNotes(cached);

      try {
        const { data } = await supabase
          .from('private_notes')
          .select('content')
          .eq('room_id', roomId)
          .eq('user_id', userName || myClientId)
          .maybeSingle();

        if (data && data.content) {
          setPrivateNotes(data.content);
          localStorage.setItem(storageKey, data.content);
        }
      } catch (err) {}
    };
    loadPrivateNotes();
  }, [isSessionActive, roomId, userName]);

  const savePrivateNotes = async (text) => {
    setPrivateNotes(text);
    setNotesSaveStatus('Saving...');
    const storageKey = `studysync_notes_${roomId}_${userName || 'user'}`;
    localStorage.setItem(storageKey, text);

    try {
      await supabase.from('private_notes').upsert(
        { room_id: roomId, user_id: userName || myClientId, content: text, updated_at: new Date().toISOString() },
        { onConflict: 'room_id,user_id' }
      );
      setNotesSaveStatus('Saved to Cloud');
    } catch (e) {
      setNotesSaveStatus('Saved Locally');
    }
    setTimeout(() => setNotesSaveStatus('Saved'), 2000);
  };

  // Save Private Study Notes directly as a real PDF file.
  // No print dialog: jsPDF creates the PDF and browser downloads it to the
  // user's configured Downloads folder automatically.
  const saveNotesAsPdf = async () => {
    const notes = (privateNotes || '').trim();
    if (!notes) {
      alert('There are no study notes to save yet.');
      return;
    }

    try {
      await ensureJsPdf();
      const JsPdfCtor = window.jspdf?.jsPDF;
      if (!JsPdfCtor) throw new Error('PDF engine did not load.');

      const doc = new JsPdfCtor({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const margin = 18;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;
      let y = margin;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Private Study Notes', margin, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`StudySync  •  ${new Date().toLocaleString()}`, margin, y);
      y += 9;

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(notes, usableWidth);
      const lineHeight = 5.5;

      lines.forEach((line) => {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(String(line), margin, y);
        y += lineHeight;
      });

      const safeRoom = String(roomId || 'room').replace(/[^a-z0-9_-]/gi, '_');
      const date = new Date().toISOString().slice(0, 10);
      doc.save(`StudySync-Private-Notes-${safeRoom}-${date}.pdf`);
    } catch (err) {
      console.error('Private notes PDF save error:', err);
      alert('Could not create the PDF. Please try again after the PDF engine loads.');
    }
  };

  const extractTextFromRegion = async (x1, y1, x2, y2) => {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    if (width < 10 || height < 10) return;
    setIsExtracting(true);
    try {
      const bgCanvas = bgCanvasRef.current;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = width;
      cropCanvas.height = height;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(bgCanvas, minX, minY, width, height, 0, 0, width, height);

      const tesseract = await ensureTesseract();
      const result = await tesseract.recognize(cropCanvas, 'eng');
      const extractedText = result.data.text.trim();

      if (extractedText) {
        const updated = privateNotes ? `${privateNotes}\n\n• ${extractedText}` : `• ${extractedText}`;
        savePrivateNotes(updated);
        setShowNotesPad(true);
      }
    } catch (err) {
      console.error('Text extraction error:', err);
      alert('Text extraction failed. Please make a slightly larger selection and try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const commitText = () => {
    if (!canUserText) {
      setTextInput({ visible: false, x: 0, y: 0, text: '' });
      return;
    }
    if (!textInput.text.trim()) {
      setTextInput({ visible: false, x: 0, y: 0, text: '' });
      return;
    }
    const fontSize = Math.max(lineWidth * 5, 22);
    const targetY = textInput.y + fontSize * 0.8;

    elementsRef.current.push({
      id: makeElementId('text'),
      type: 'text',
      text: textInput.text,
      x: textInput.x,
      y: targetY,
      color,
      fontSize,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    redrawCanvas();
    broadcastAllElements();
    setTextInput({ visible: false, x: 0, y: 0, text: '' });
  };

  // Convert screen coordinates to the actual 4000x2500 canvas coordinate system.
  // IMPORTANT: use the transformed canvas bounding rect itself. The old code used
  // the viewport rect, which ignored the viewport's top padding and could produce
  // a visible ~1 inch drawing offset, especially on mobile / zoomed canvases.
  const getCanvasCoords = (e) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width || zoomScale || 1;
    const scaleY = rect.height / canvas.height || zoomScale || 1;

    return {
      x: Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) / scaleX)),
      y: Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) / scaleY)),
    };
  };

  const canUserDraw = isHost || isCoHost || (userPermissions.canDraw ?? permissions.canDraw);
  const canUserText = isHost || isCoHost || (userPermissions.canText ?? permissions.canText);
  const canUserUpload = isHost || isCoHost || (userPermissions.canUpload ?? permissions.canUpload);
  const canUserVoice = isHost || isCoHost || (userPermissions.canVoice ?? permissions.canVoiceChat);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;

    const { x, y } = getCanvasCoords(e);
    setShowShapesMenu(false);
    setShowColorPalette(false);

    if (tool === 'select') {
      let foundEl = null;
      for (let i = elementsRef.current.length - 1; i >= 0; i--) {
        if (isPointInsideElement(x, y, elementsRef.current[i])) {
          foundEl = elementsRef.current[i];
          break;
        }
      }

      setSelectedElementId(foundEl ? foundEl.id : null);
      if (foundEl) {
        isDraggingElementRef.current = true;
        dragStartPosRef.current = { x, y };
      }
      redrawCanvas();
      return;
    }

    if (tool === 'laser') {
      const canLaser = isHost || isCoHost || (userPermissions.canSharePointer ?? permissions.canSharePointer);
      if (!canLaser) return;
      setIsDrawing(true);
      addLaserPoint(x, y, true);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'draw-laser',
        payload: { x, y },
      });
      return;
    }

    if (tool === 'sticky') {
      if (!canUserDraw) return;
      addStickyNote(x, y);
      return;
    }

    if (tool === 'text') {
      if (!canUserText) {
        alert('Text permission is disabled. Ask the host to allow Text.');
        return;
      }
      if (textInput.visible) commitText();
      setTextInput({ visible: true, x, y, text: '' });
      return;
    }

    // Guests without Draw permission may still draw locally. Their drawing is
    // kept in the local element list so it survives redraws/tool changes, but
    // it is never broadcast until they are permitted.
    if (!canUserDraw && tool !== 'extract') {
      if (['pencil', 'eraser', 'highlighter', 'smart'].includes(tool)) {
        setIsDrawing(true);
        isDrawingRef.current = true;
        setStartPos({ x, y });
        const drawCanvas = drawCanvasRef.current;
        setSnapshot(drawCtxRef.current.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
        strokeStartTimeRef.current = Date.now();
        currentStrokeRef.current = [{ x, y, t: 0 }];
        drawCtxRef.current.beginPath();
        drawCtxRef.current.moveTo(x, y);
      }
      return;
    }

    if (textInput.visible) commitText();

    setIsDrawing(true);
    isDrawingRef.current = true;
    setStartPos({ x, y });

    const drawCanvas = drawCanvasRef.current;
    setSnapshot(drawCtxRef.current.getImageData(0, 0, drawCanvas.width, drawCanvas.height));

    if (['pencil', 'eraser', 'highlighter', 'smart'].includes(tool)) {
      strokeStartTimeRef.current = Date.now();
      currentStrokeRef.current = [{ x, y, t: 0 }];
      drawCtxRef.current.beginPath();
      drawCtxRef.current.moveTo(x, y);
    }
  };

  const drawShapeDirect = (ctx, shapeTool, fromX, fromY, toX, toY) => {
    ctx.beginPath();
    if (shapeTool === 'line') {
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    } else if (shapeTool === 'arrow') {
      const headLength = 16;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else if (shapeTool === 'rectangle') {
      ctx.strokeRect(fromX, fromY, toX - fromX, toY - fromY);
    } else if (shapeTool === 'circle') {
      const radius = Math.hypot(toX - fromX, toY - fromY);
      ctx.arc(fromX, fromY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (shapeTool === 'triangle') {
      ctx.moveTo(fromX + (toX - fromX) / 2, fromY);
      ctx.lineTo(fromX, toY);
      ctx.lineTo(toX, toY);
      ctx.closePath();
      ctx.stroke();
    } else if (shapeTool === 'star') {
      const spikes = 5;
      const outerRadius = Math.hypot(toX - fromX, toY - fromY);
      const innerRadius = outerRadius / 2;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;

      ctx.moveTo(fromX, fromY - outerRadius);
      for (let i = 0; i < spikes; i++) {
        let sx = fromX + Math.cos(rot) * outerRadius;
        let sy = fromY + Math.sin(rot) * outerRadius;
        ctx.lineTo(sx, sy);
        rot += step;
        sx = fromX + Math.cos(rot) * innerRadius;
        sy = fromY + Math.sin(rot) * innerRadius;
        ctx.lineTo(sx, sy);
        rot += step;
      }
      ctx.lineTo(fromX, fromY - outerRadius);
      ctx.closePath();
      ctx.stroke();
    }
  };

  const handleMouseMove = (e) => {
    const { x, y } = getCanvasCoords(e);

    if (tool === 'select') {
      if (isDraggingElementRef.current && selectedElementId !== null) {
        const dx = x - dragStartPosRef.current.x;
        const dy = y - dragStartPosRef.current.y;
        dragStartPosRef.current = { x, y };

        const targetEl = elementsRef.current.find((el) => el.id === selectedElementId);
        if (targetEl) {
          moveElementByDelta(targetEl, dx, dy);
          targetEl.updatedAt = Date.now();
          redrawCanvas();
        }
      }
      return;
    }

    if (tool === 'laser' && isDrawing) {
      addLaserPoint(x, y);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'draw-laser',
        payload: { x, y },
      });
      return;
    }

    const canSendPointer = isHost || isCoHost || (userPermissions.canSharePointer ?? permissions.canSharePointer);
    if (canSendPointer && (isHost || isCoHost || shareMyPointer)) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'cursor-move',
        payload: { clientId: myClientId, x, y, visible: true, name: userName || (isHost ? 'Host' : 'Guest'), isHost: isHost || isCoHost },
      });
    }

    if (!isDrawing) return;

    const ctx = drawCtxRef.current;
    const isLocalOnlyStroke = !canUserDraw && ['pencil', 'eraser', 'highlighter', 'smart'].includes(tool);

    if (['pencil', 'eraser', 'highlighter'].includes(tool)) {
      ctx.lineTo(x, y);
      ctx.stroke();
      currentStrokeRef.current.push({ x, y });
    } else if (tool === 'smart') {
      ctx.lineTo(x, y);
      ctx.stroke();
      const t = Date.now() - strokeStartTimeRef.current;
      currentStrokeRef.current.push({ x, y, t });
    } else if (tool === 'extract' && snapshot) {
      ctx.putImageData(snapshot, 0, 0);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
      ctx.restore();
    } else if (snapshot) {
      ctx.putImageData(snapshot, 0, 0);
      drawShapeDirect(ctx, tool, startPos.x, startPos.y, x, y);
    }
  };

  useEffect(() => {
    if (!isSessionActive) return;

    // Pointer events work for mouse, touch and stylus. Keeping a window-level
    // release prevents a stroke from getting stuck when the finger/mouse leaves
    // the canvas before release.
    const releasePointer = (event) => {
      if (isDrawingRef.current) handleMouseUp(event);
    };

    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    return () => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
    };
  }, [isSessionActive, tool]);

  const handleMouseLeave = (e) => {
    const canSendPointer = isHost || isCoHost || (userPermissions.canSharePointer ?? permissions.canSharePointer);
    if (canSendPointer && (isHost || isCoHost || shareMyPointer)) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'cursor-move',
        payload: { clientId: myClientId, x: -100, y: -100, visible: false, name: '' },
      });
    }
    // Pointer capture keeps touch/stylus drawing alive even when the finger
    // crosses the canvas boundary. Do not finish a touch stroke on pointerleave.
    if (e?.pointerType !== 'touch' && !e?.pointerType) handleMouseUp(e);
  };

  const handleMouseUp = (e) => {
    if (tool === 'select') {
      if (isDraggingElementRef.current) {
        isDraggingElementRef.current = false;
        const moved = elementsRef.current.find((el) => el.id === selectedElementId);
        if (moved) broadcastUpdatedElement(moved);
      }
      return;
    }

    if (tool === 'laser') {
      setIsDrawing(false);
      isDrawingRef.current = false;
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    isDrawingRef.current = false;

    const isLocalOnlyStroke = !canUserDraw && ['pencil', 'eraser', 'highlighter', 'smart'].includes(tool);
    const { x, y } = e ? getCanvasCoords(e) : startPos;

    if (tool === 'extract') {
      if (snapshot) drawCtxRef.current.putImageData(snapshot, 0, 0);
      extractTextFromRegion(startPos.x, startPos.y, x, y);
      return;
    }

    if (tool === 'smart') {
      drawCtxRef.current.closePath();
      const strokePoints = [...currentStrokeRef.current];
      currentStrokeRef.current = [];

      // Unpermitted guests still get the full Auto-correct experience on
      // their own board. The resulting element is simply not broadcast.
      if (snapshot) drawCtxRef.current.putImageData(snapshot, 0, 0);
      const corrected = recognizeAndDrawSmartShape(strokePoints, !isLocalOnlyStroke);

      // If the stroke is not confidently recognizable as a shape, Smart Pen
      // must behave like a normal pen instead of silently deleting the stroke.
      if (!corrected && strokePoints.length > 1) {
        const now = Date.now();
        const fallback = {
          id: makeElementId('smart-stroke'),
          type: 'stroke',
          points: strokePoints,
          color: colorRef.current,
          width: lineWidthRef.current,
          createdAt: now,
          updatedAt: now,
        };
        elementsRef.current.push(fallback);
        redrawCanvas();
        if (!isLocalOnlyStroke) broadcastElement(fallback);
      }
      return;
    }

    if (['pencil', 'eraser', 'highlighter'].includes(tool)) {
      drawCtxRef.current.closePath();

      // Permission controls sharing, not whether the guest can draw on
      // their own canvas. Store local-only strokes in the same canonical
      // element list so they survive tool changes and redraws.
      const newElement = {
        id: makeElementId('stroke'),
        type: 'stroke',
        points: [...currentStrokeRef.current],
        color,
        width: lineWidth,
        isHighlighter: tool === 'highlighter',
        isEraser: tool === 'eraser',
        localOnly: isLocalOnlyStroke,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      elementsRef.current.push(newElement);
      currentStrokeRef.current = [];
      redrawCanvas();
      if (!isLocalOnlyStroke) broadcastElement(newElement);
    } else {
      if (snapshot) drawCtxRef.current.putImageData(snapshot, 0, 0);
      const newElement = {
        id: makeElementId('shape'),
        type: 'shape',
        shapeTool: tool,
        fromX: startPos.x,
        fromY: startPos.y,
        toX: x,
        toY: y,
        color,
        width: lineWidth,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      elementsRef.current.push(newElement);
      redrawCanvas();
      broadcastElement(newElement);
    }
  };

  const clearCanvas = () => {
    if (!canUserDraw) return;
    elementsRef.current = [];
    redrawCanvas();
    setTextInput({ visible: false, x: 0, y: 0, text: '' });

    safeBroadcast('board-clear', { clearedAt: Date.now() });
    safeBroadcast('clear-board', { clearedAt: Date.now() });
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}&host=false`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const changeTool = (nextTool) => {
    if (isDrawingRef.current) {
      // Cancel only the transient preview. The canonical element list is never
      // touched, so changing Pencil -> Highlighter can never erase old work.
      currentStrokeRef.current = [];
      isDrawingRef.current = false;
      setIsDrawing(false);
    }
    toolRef.current = nextTool;
    setTool(nextTool);
    setSelectedElementId(null);
    requestAnimationFrame(() => redrawCanvas());
    setShowShapesMenu(false);
  };

  const isShapeActive = ['rectangle', 'circle', 'line', 'arrow', 'triangle', 'star'].includes(tool);

  if (!isSessionActive) {
    return <AuthRoomModal onLaunchSession={handleLaunchSession} initialRoom={initialUrlRoom} />;
  }

  const isOnlyOneInRoom = participants.length <= 1;

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden select-none font-['Inter',sans-serif] bg-slate-100 text-slate-800 studysync-app" style={{ touchAction: 'none' }}>
      <style>{`
        .studysync-app, .studysync-app * { -webkit-tap-highlight-color: transparent; }
        .studysync-header { overflow-x: auto; scrollbar-width: none; }
        .studysync-header::-webkit-scrollbar, .studysync-dock::-webkit-scrollbar { display: none; }
        .studysync-header > div { flex-shrink: 0; }
        .studysync-dock { max-width: calc(100vw - 24px); overflow-x: auto; overflow-y: visible; scrollbar-width: none; }
        .studysync-dock > div { flex-shrink: 0; }
        @media (max-width: 768px) {
          .studysync-header { height: 56px; padding-left: 8px; padding-right: 8px; justify-content: flex-start; gap: 10px; }
          .studysync-header > div { gap: 6px; }
          .studysync-header button { min-height: 38px; }
          .studysync-header .font-mono { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .studysync-dock { left: 8px; right: 8px; bottom: max(8px, env(safe-area-inset-bottom)); transform: none; max-width: none; width: auto; padding: 6px 8px; border-radius: 16px; gap: 8px; justify-content: flex-start; }
          .studysync-dock button { touch-action: manipulation; }
          .studysync-panel { left: 12px !important; right: 12px !important; width: auto !important; max-width: none !important; }
          .studysync-slides-panel { max-height: 62vh; }
          .studysync-chat-panel { height: min(480px, 68vh) !important; }
          .studysync-notes-panel { max-height: 72vh; }
          .studysync-notes-panel textarea { height: min(46vh, 360px) !important; }
        }
        @media (max-width: 420px) {
          .studysync-header .studysync-brand-name { display: none; }
          .studysync-header { gap: 7px; }
          .studysync-dock { max-width: none; }
        }
      `}</style>

      {/* FIXED TOP HEADER */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 flex items-center justify-between z-40 shadow-sm studysync-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-sm">
            S
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-900 studysync-brand-name">StudySync</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isHost ? 'bg-blue-100 text-blue-700' : isCoHost ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
            {isHost ? 'Host' : isCoHost ? 'Co-Host' : 'Guest'}
          </span>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
            #{roomId}
          </span>
        </div>

        {/* Center Controls */}
        <div className="flex items-center gap-2">
          {!isRecording ? (
            <button onClick={startRecording} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              <span>Record</span>
            </button>
          ) : (
            <button onClick={stopRecording} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>REC {formatRecordingTime(recordingSeconds)}</span>
            </button>
          )}

          <button onClick={captureBoardSnapshot} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition flex items-center gap-1">
            <span>📸 Snap</span>
          </button>

          <button onClick={() => setShowSlidesDrawer(!showSlidesDrawer)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${savedSlides.length > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
            <span>📑 Slides ({savedSlides.length})</span>
          </button>

          {numPages > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 ml-1">
              <button onClick={() => changePdfPage(-1)} disabled={pageNum <= 1} className="hover:text-blue-600 font-bold disabled:opacity-30">◀</button>
              <span className="font-mono">{pageNum} / {numPages}</span>
              <button onClick={() => changePdfPage(1)} disabled={pageNum >= numPages} className="hover:text-blue-600 font-bold disabled:opacity-30">▶</button>
            </div>
          )}

          {hasDocument && (
            <button onClick={() => resetBackgroundCanvas(true)} className="text-[11px] font-semibold text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition">
              Remove Doc
            </button>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => { if (isHost) { setActiveTabPermissions('participants'); setShowPermissionsModal(true); } }} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>👥 {participants.length || 1}</span>
          </button>

          <button onClick={() => setShowChatPad(!showChatPad)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${showChatPad ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            💬 Chat {messages.length > 0 ? `(${messages.length})` : ''}
          </button>

          <button onClick={() => setShowNotesPad(!showNotesPad)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${showNotesPad ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            <span>📝 Notes</span>
            <span className="text-[10px] opacity-70">🔒</span>
          </button>

          <button onClick={toggleMic} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${isMicOn ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            {isMicOn ? '🎙️ Mic ON' : '📞 Voice'}
          </button>

          {isHost && (
            <button onClick={() => { setActiveTabPermissions('global'); setShowPermissionsModal(true); }} title="Room Permissions" className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition">
              🛡️
            </button>
          )}

          <button onClick={copyInviteLink} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition">
            {copiedLink ? '✓ Copied' : '🔗 Share'}
          </button>

          {/* Dynamic Leave vs Disable Room Button */}
          <button onClick={handleLeaveOrDisableRoom} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${isOnlyOneInRoom && (isHost || isCoHost) ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm' : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'}`}>
            <span>{isOnlyOneInRoom && (isHost || isCoHost) ? '🗑️ Disable Room' : '🚪 Leave'}</span>
          </button>
        </div>
      </header>

      {/* FIXED BOTTOM WORKSPACE DOCK */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-slate-200/90 rounded-2xl px-4 py-2 flex items-center gap-3 z-40 studysync-dock">
        <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl text-xs font-mono">
          <button onClick={() => handleZoom(-0.1)} className="hover:text-blue-600 font-bold px-1">−</button>
          <span>{Math.round(zoomScale * 100)}%</span>
          <button onClick={() => handleZoom(0.1)} className="hover:text-blue-600 font-bold px-1">+</button>
          <button onClick={handleResetZoom} title="Reset zoom and position" className="ml-1 px-2 py-1 rounded-lg bg-white hover:bg-blue-50 text-[10px] font-bold text-slate-600 border border-slate-200">Reset</button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        <div className="flex items-center gap-1">
          <button onClick={() => { changeTool('select'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'select' ? 'bg-blue-600 text-white shadow-sm font-bold scale-105' : 'hover:bg-slate-100 text-slate-700'}`}>
            ✋
          </button>
          <button onClick={() => { changeTool('pencil'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'pencil' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'}`}>
            ✏️
          </button>
          <button onClick={() => { changeTool('highlighter'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'highlighter' ? 'bg-yellow-400 text-yellow-950 shadow-sm font-bold' : 'hover:bg-slate-100'}`}>
            🖍️
          </button>
          <button onClick={() => { changeTool('smart'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'smart' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'}`}>
            ✨
          </button>
          <button onClick={() => { changeTool('laser'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'laser' ? 'bg-rose-600 text-white shadow-sm animate-pulse' : 'hover:bg-slate-100'}`}>
            ⚡
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        <div className="flex items-center gap-1">
          <div className="relative">
            <button onClick={() => setShowShapesMenu(!showShapesMenu)} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${isShapeActive ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'}`}>
              ⬡
            </button>
            {showShapesMenu && (
              <div className="absolute bottom-12 left-0 bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 grid grid-cols-2 gap-1 w-36 z-50">
                {[{ id: 'rectangle', label: '▭ Box' }, { id: 'circle', label: '⭕ Circle' }, { id: 'line', label: '― Line' }, { id: 'arrow', label: '➔ Arrow' }, { id: 'triangle', label: '▲ Triangle' }, { id: 'star', label: '★ Star' }].map((s) => (
                  <button key={s.id} onClick={() => { changeTool(s.id); }} className={`px-2 py-1.5 rounded-lg text-xs font-medium text-left transition ${tool === s.id ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-slate-100'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => { if (!canUserText) { alert('Text permission is disabled. Ask the host.'); return; } changeTool('text'); }} title="Text" className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition ${tool === 'text' ? 'bg-blue-600 text-white shadow-sm' : canUserText ? 'hover:bg-slate-100' : 'opacity-40 cursor-not-allowed'}`}>
            T
          </button>
          <button onClick={() => { changeTool('sticky'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'sticky' ? 'bg-yellow-400 text-yellow-950 shadow-sm' : 'hover:bg-slate-100'}`}>
            📌
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        <div className="flex items-center gap-1">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" className="hidden" />
          <button onClick={() => { if (!canUserUpload) { alert('File/PDF upload permission is disabled. Ask the host.'); return; } fileInputRef.current?.click(); }} title="Upload PDF/Image" className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${canUserUpload ? 'hover:bg-slate-100' : 'opacity-40 cursor-not-allowed'}`}>📄</button>
          <button onClick={() => { changeTool('extract'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'extract' ? 'bg-purple-600 text-white shadow-sm' : 'hover:bg-slate-100'}`}>🔍</button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowColorPalette(!showColorPalette)} className="w-6 h-6 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-300 hover:scale-105 transition" style={{ backgroundColor: color }} />
            {showColorPalette && (
              <div className="absolute bottom-12 left-0 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 w-64 z-50 select-none">
                <div className="mb-2.5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Theme Colors</div>
                  <div className="flex flex-col gap-1">
                    {themePalette.map((row, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-10 gap-1">
                        {row.map((c, cIdx) => (
                          <button key={`${rIdx}-${cIdx}`} type="button" onClick={() => { selectColor(c); setShowColorPalette(false); }} style={{ backgroundColor: c }} className={`w-5 h-3.5 rounded-[2px] border transition hover:scale-125 ${color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-blue-600 border-white' : 'border-slate-200'}`} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 hover:text-blue-600 cursor-pointer">
                    <input type="color" value={color} onChange={(e) => selectColor(e.target.value)} className="w-5 h-5 rounded border-0 cursor-pointer p-0" />
                    <span>More Colors...</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <input type="range" min="1" max="12" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="w-16 accent-blue-600 cursor-pointer" />
          <button onClick={() => { changeTool('eraser'); }} className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${tool === 'eraser' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'}`}>🧹</button>
          <button onClick={clearCanvas} className="text-xs font-bold text-rose-500 hover:text-rose-700 ml-1">Clear</button>
        </div>
      </div>

      {/* SLIDES DRAWER */}
      {showSlidesDrawer && (
        <div className="fixed top-16 left-6 w-80 max-h-[75vh] bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 rounded-2xl p-4 z-40 flex flex-col studysync-panel studysync-slides-panel">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
            <span className="font-bold text-xs">📑 Snapped Slides ({savedSlides.length})</span>
            <button onClick={() => setShowSlidesDrawer(false)} className="text-xs text-slate-400 font-bold">✕</button>
          </div>
          <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
            {savedSlides.map((slide) => (
              <div key={slide.id} className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                <img src={slide.dataUrl} alt={slide.title} className="w-16 h-12 object-cover rounded-lg border bg-white" />
                <div className="flex-1">
                  <div className="text-xs font-bold">{slide.title}</div>
                  <div className="text-[10px] text-slate-400">{slide.timestamp}</div>
                </div>
                <button onClick={() => setSavedSlides((prev) => prev.filter((s) => s.id !== slide.id))} className="text-slate-400 hover:text-rose-600 text-xs px-1">✕</button>
              </div>
            ))}
          </div>
          {savedSlides.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
              <button onClick={exportSlidesToPdf} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition">Extract All as PDF</button>
              <button onClick={() => setSavedSlides([])} className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-semibold transition">Clear</button>
            </div>
          )}
        </div>
      )}

      {/* CHAT DRAWER */}
      {showChatPad && (
        <div className="fixed top-16 right-6 w-80 h-[480px] bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 rounded-2xl p-4 z-40 flex flex-col studysync-panel studysync-chat-panel">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="font-bold text-xs">💬 In-Room Chat</span>
            <button onClick={() => setShowChatPad(false)} className="text-xs text-slate-400 font-bold">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 p-1 text-xs">
            {messages.map((m) => (
              <div key={m.id} className="bg-slate-50 border border-slate-100 p-2 rounded-xl">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-[11px] text-blue-600">{m.sender}</span>
                  <span className="text-[9px] text-slate-400">{m.time}</span>
                </div>
                <div className="leading-relaxed break-words">{m.text}</div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <form onSubmit={sendChatMessage} className="mt-2 pt-2 border-t border-slate-100 flex gap-2">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Type doubt..." className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-500" />
            <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition">Send</button>
          </form>
        </div>
      )}

      {/* PRIVATE NOTES PANEL */}
      {showNotesPad && (
        <div className="fixed top-16 right-6 w-84 bg-white/95 backdrop-blur shadow-2xl border border-slate-200 rounded-2xl p-4 z-40 flex flex-col studysync-panel studysync-notes-panel">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="font-bold text-xs">📝 Private Study Notes</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-emerald-600 font-medium mr-1">● {notesSaveStatus}</span>
              <button
                type="button"
                onClick={saveNotesAsPdf}
                disabled={!privateNotes.trim()}
                title="Save notes as PDF"
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                📄 PDF
              </button>
              <button onClick={() => setShowNotesPad(false)} className="text-xs text-slate-400 font-bold ml-0.5">✕</button>
            </div>
          </div>
          <textarea value={privateNotes} onChange={(e) => savePrivateNotes(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Type personal notes..." className="w-full h-72 bg-slate-50/80 p-3 rounded-xl resize-none border border-slate-200 outline-none text-xs leading-relaxed font-mono select-text" />
        </div>
      )}

      {showHostLeaveModal && isHost && participants.length > 1 && (
        <div className="fixed inset-0 z-[80] bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5">
            <div className="text-lg font-bold text-slate-900">Choose the new host</div>
            <p className="text-xs text-slate-500 mt-1 mb-4">You need to hand over host access before leaving this room.</p>
            <div className="space-y-2 max-h-64 overflow-auto">
              {participants.filter((p) => p.clientId !== myClientId).map((p) => (
                <button key={p.clientId} type="button" onClick={() => setSelectedHostSuccessor(p.clientId)} className={`w-full text-left p-3 rounded-xl border transition ${selectedHostSuccessor === p.clientId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <div className="font-semibold text-sm text-slate-800">{p.userName || 'Guest'}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.clientId}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowHostLeaveModal(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">Cancel</button>
              <button type="button" disabled={!selectedHostSuccessor} onClick={() => completeHostHandoffAndLeave(selectedHostSuccessor)} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold">Make Host & Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* HOST PERMISSIONS & CO-HOST ASSIGNMENT MODAL */}
      {showPermissionsModal && isHost && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Room Governance &amp; Co-Hosts</h3>
                <p className="text-[11px] text-slate-500">Manage global permissions and co-hosts</p>
              </div>
              <button onClick={() => setShowPermissionsModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1 mb-4">
              <button onClick={() => setActiveTabPermissions('global')} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${activeTabPermissions === 'global' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}`}>Global Defaults</button>
              <button onClick={() => setActiveTabPermissions('participants')} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${activeTabPermissions === 'participants' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}`}>Participants ({participants.length})</button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {activeTabPermissions === 'global' ? (
                <div className="space-y-3.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50">
                    <div>
                      <div className="font-semibold text-slate-800">Sync Zoom &amp; Scroll Globally</div>
                    </div>
                    <input type="checkbox" checked={permissions.syncZoomGlobally} onChange={(e) => updateHostPermission('syncZoomGlobally', e.target.checked)} className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
                  </div>
                  {[
                    ['canDraw', 'Allow guests to Draw / Whiteboard'],
                    ['canText', 'Allow guests to use Text'],
                    ['canUpload', 'Allow guests to upload PDF / Images'],
                    ['canVoiceChat', 'Allow guests to use Voice Call'],
                    ['canSharePointer', 'Allow guests to share Pointer'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50">
                      <div className="font-semibold text-slate-800">{label}</div>
                      <input type="checkbox" checked={Boolean(permissions[key])} onChange={(e) => updateHostPermission(key, e.target.checked)} className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {participants.map((p) => {
                    const isMe = p.clientId === myClientId;
                    const isPeerCoHost = coHostIds.includes(p.clientId);

                    return (
                      <div key={p.clientId} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${p.isHost ? 'bg-amber-100 text-amber-800' : isPeerCoHost ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-700'}`}>
                            {p.userName ? p.userName[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <span>{p.userName || 'Guest'}</span>
                              {isMe && <span className="text-[10px] text-slate-400 font-normal">(You)</span>}
                              {p.isHost && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-bold">Host</span>}
                              {isPeerCoHost && <span className="text-[9px] bg-purple-100 text-purple-800 px-1 py-0.2 rounded font-bold">Co-Host</span>}
                            </div>
                          </div>
                        </div>

                        {!p.isHost && isHost && (
                          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                            <button type="button" onClick={() => toggleCoHostStatus(p.clientId)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${isPeerCoHost ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
                              {isPeerCoHost ? '👑 Co-Host ON' : 'Make Co-Host'}
                            </button>
                            <button type="button" onClick={() => transferHost(p.clientId)} className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 text-[10px] font-bold">Transfer Host</button>
                            <button type="button" onClick={() => kickParticipant(p.clientId)} className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 text-[10px] font-bold">Remove</button>
                            <div className="w-full grid grid-cols-5 gap-1 mt-1">
                              {[
                                ['canDraw', 'Draw'],
                                ['canText', 'Text'],
                                ['canUpload', 'Upload'],
                                ['canVoice', 'Voice'],
                                ['canSharePointer', 'Pointer'],
                              ].map(([key, label]) => {
                                const current = participantOverrides[p.clientId] || { canDraw: null, canText: null, canUpload: null, canVoice: null, canSharePointer: null };
                                return (
                                  <button key={key} type="button" onClick={() => updateParticipantOverride(p.clientId, key, current[key] === null ? true : current[key] === true ? false : null)} className={`px-1.5 py-1 rounded-md text-[9px] font-bold border ${current[key] === null ? 'bg-slate-100 text-slate-500 border-slate-200' : current[key] ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-500 border-rose-200'}`}>
                                    {label} {current[key] === null ? '↔' : current[key] ? '✓' : '×'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={() => setShowPermissionsModal(false)} className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition">Done</button>
          </div>
        </div>
      )}

      {snapNotice && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg animate-bounce">
          ✓ Slide captured to in-app gallery!
        </div>
      )}

      {textInput.visible && canUserText && (
        <div
          className="fixed z-[60]"
          style={{
            left: `${textInput.x * zoomScale + panOffset.x}px`,
            top: `${textInput.y * zoomScale + panOffset.y + 56}px`,
          }}
        >
          <textarea
            ref={textInputRef}
            value={textInput.text}
            onChange={(e) => setTextInput((prev) => ({ ...prev, text: e.target.value }))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                commitText();
              }
              if (e.key === 'Escape') {
                setTextInput({ visible: false, x: 0, y: 0, text: '' });
              }
            }}
            onBlur={commitText}
            placeholder="Type text…"
            rows={2}
            className="w-56 min-h-16 resize-none bg-white border-2 border-blue-500 rounded-xl px-3 py-2 text-sm text-slate-900 shadow-xl outline-none select-text"
          />
          <div className="text-[9px] text-slate-500 mt-1 bg-white/90 px-2 py-1 rounded-md shadow-sm">Ctrl/Cmd + Enter to place • Esc to cancel</div>
        </div>
      )}

      {/* INFINITE EXPANDING CANVAS VIEWPORT */}
      <div ref={viewportRef} className="absolute inset-0 w-screen h-[100dvh] overflow-hidden pt-14 cursor-crosshair z-0" style={{ touchAction: 'none' }}>
        <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`, transformOrigin: 'top left', width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }} className="relative top-0 left-0">
          <canvas ref={bgCanvasRef} className="absolute top-0 left-0 pointer-events-none z-0 shadow-sm" />
          <canvas
            ref={drawCanvasRef}
            onPointerDown={(e) => {
              // Do not let the browser pan/zoom/scroll the page while drawing.
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              handleMouseDown(e);
            }}
            onPointerMove={(e) => {
              e.preventDefault();
              handleMouseMove(e);
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.currentTarget.releasePointerCapture?.(e.pointerId);
              handleMouseUp(e);
            }}
            onPointerCancel={(e) => {
              e.preventDefault();
              e.currentTarget.releasePointerCapture?.(e.pointerId);
              handleMouseUp(e);
            }}
            onPointerLeave={handleMouseLeave}
            style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            className="absolute top-0 left-0 z-10 touch-none"
          />
          <canvas ref={laserCanvasRef} className="absolute top-0 left-0 pointer-events-none z-20" />

          {Object.values(remoteCursors).map((cursor) => (
            cursor?.visible && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) ? (
              <div
                key={cursor.clientId}
                className="absolute z-30 pointer-events-none transition-transform duration-75"
                style={{ left: `${cursor.x}px`, top: `${cursor.y}px`, transform: 'translate(-2px, -2px)' }}
              >
                <div className="relative">
                  <div className={`w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[16px] ${cursor.isHost ? 'border-b-amber-500' : 'border-b-blue-600'} rotate-[-28deg] drop-shadow-sm`} />
                  <div className={`absolute left-3 top-3 whitespace-nowrap px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white shadow-sm ${cursor.isHost ? 'bg-amber-500' : 'bg-blue-600'}`}>
                    {cursor.isHost ? '👑 ' : ''}{cursor.name || 'Guest'}
                  </div>
                </div>
              </div>
            ) : null
          ))}

          {stickyNotes.map((note) => (
            <div key={note.id} style={{ left: `${note.x}px`, top: `${note.y}px`, backgroundColor: note.bgColor }} className="absolute z-25 w-44 min-h-[110px] p-2.5 rounded-xl shadow-lg border border-yellow-300 text-slate-800 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-yellow-800">📌 NOTE</span>
                <button onClick={() => deleteStickyNote(note.id)} className="text-xs font-bold text-yellow-800 hover:text-rose-600">✕</button>
              </div>
              <textarea defaultValue={note.text} onBlur={(e) => updateStickyText(note.id, e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="w-full bg-transparent resize-none border-none outline-none text-xs text-slate-800 leading-snug" rows={3} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}