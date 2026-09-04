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
  const viewportRef = useRef(null);

  // Audio / WebRTC Refs
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Screen Recording
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Sticky Notes State
  const [stickyNotes, setStickyNotes] = useState([]);

  // Session State (Connected to Login Modal)
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [initialUrlRoom, setInitialUrlRoom] = useState('');
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // In-App Slides Gallery
  const [savedSlides, setSavedSlides] = useState([]);
  const [showSlidesDrawer, setShowSlidesDrawer] = useState(false);
  const [snapNotice, setSnapNotice] = useState(false);

  // Live In-Room Chat State
  const [showChatPad, setShowChatPad] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef(null);

  // Host Permissions
  const [permissions, setPermissions] = useState({
    canDraw: true,
    canSharePointer: true,
    syncZoomGlobally: true,
  });

  // Tools: 'pencil' | 'highlighter' | 'smart' | 'laser' | 'sticky' | 'eraser' | 'text' | 'extract' | shapes
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#2563eb');
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);

  // Smart Draw & Laser Points
  const currentStrokeRef = useRef([]);
  const laserPointsRef = useRef([]);

  // Infinite Scroll & Zoom Viewport
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const zoomScaleRef = useRef(1);

  // Quick Notes State
  const [showNotesPad, setShowNotesPad] = useState(false);
  const [sharedNotes, setSharedNotes] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // OCR State
  const [isExtracting, setIsExtracting] = useState(false);

  // PDF Single Page State
  const pdfDocRef = useRef(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);

  // Pointer State
  const [shareMyPointer, setShareMyPointer] = useState(true);
  const [remoteCursor, setRemoteCursor] = useState({ x: -100, y: -100, visible: false, name: 'Guest' });

  // Voice State
  const [isMicOn, setIsMicOn] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);

  // Document Presence
  const [hasDocument, setHasDocument] = useState(false);

  // History Stacks
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);

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

  const paletteColors = [
    '#0f172a', '#2563eb', '#7c3aed', '#db2777', 
    '#ea580c', '#16a34a', '#0284c7', '#eab308'
  ];

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  // Read URL query params on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const existingRoom = urlParams.get('room');
    if (existingRoom) {
      setInitialUrlRoom(existingRoom);
    }
  }, []);

  // Connect Login Screen to Whiteboard Session
  const handleLaunchSession = ({ roomId: targetRoom, isHost: hostStatus, userName: name, settings }) => {
    setRoomId(targetRoom);
    setIsHost(hostStatus);
    setUserName(name);
    if (settings && hostStatus) {
      setPermissions((prev) => ({ ...prev, ...settings }));
    }
    setIsSessionActive(true);
    window.history.replaceState({}, '', `?room=${targetRoom}&host=${hostStatus}`);
  };

  // Infinite board area for writing continuous sums & problems
  const CANVAS_WIDTH = 4000;
  const CANVAS_HEIGHT = 10000;

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
    drawCtxRef.current = drawCtx;

    const laserCtx = laserCanvas.getContext('2d');
    laserCtx.lineCap = 'round';
    laserCtx.lineJoin = 'round';
    laserCtxRef.current = laserCtx;

    const initialData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    setHistory([initialData]);
    setHistoryStep(0);

    const channel = supabase.channel(`room-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'draw-stroke' }, ({ payload }) => applyRemoteStroke(payload))
      .on('broadcast', { event: 'draw-shape' }, ({ payload }) => applyRemoteShape(payload))
      .on('broadcast', { event: 'draw-text' }, ({ payload }) => applyRemoteText(payload))
      .on('broadcast', { event: 'draw-laser' }, ({ payload }) => addLaserPoint(payload.x, payload.y))
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => setMessages((prev) => [...prev, payload]))
      .on('broadcast', { event: 'sync-stickies' }, ({ payload }) => setStickyNotes(payload.stickies))
      .on('broadcast', { event: 'clear-board' }, () => {
        const dCanvas = drawCanvasRef.current;
        drawCtxRef.current.clearRect(0, 0, dCanvas.width, dCanvas.height);
      })
      .on('broadcast', { event: 'sync-canvas-state' }, ({ payload }) => loadCanvasDataUrl(payload.dataUrl))
      .on('broadcast', { event: 'cursor-move' }, ({ payload }) => setRemoteCursor(payload))
      .on('broadcast', { event: 'permissions-update' }, ({ payload }) => setPermissions(payload))
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
      .on('broadcast', { event: 'sync-notes' }, ({ payload }) => setSharedNotes(payload.text))
      .on('broadcast', { event: 'webrtc-offer' }, async ({ payload }) => handleReceiveOffer(payload.offer))
      .on('broadcast', { event: 'webrtc-answer' }, async ({ payload }) => {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      })
      .on('broadcast', { event: 'webrtc-candidate' }, async ({ payload }) => {
        if (peerConnectionRef.current && payload.candidate) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.error(e);
          }
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((track) => track.stop());
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isSessionActive, roomId]);

  // Infinite Native Wheel Scroll & Pinch Zoom Listener
  useEffect(() => {
    if (!isSessionActive) return;

    const handleWheel = (e) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom in / Zoom out relative to cursor
        const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
        const newScale = Math.min(Math.max(Number((zoomScaleRef.current * zoomFactor).toFixed(2)), 0.3), 3.0);
        setZoomScale(newScale);

        if (isHost && permissions.syncZoomGlobally) {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'sync-view',
            payload: { scale: newScale, pan: panOffsetRef.current },
          });
        }
      } else {
        // Natural Multi-directional Scroll (Down, Up, Side to continue writing)
        const newPan = {
          x: panOffsetRef.current.x - e.deltaX,
          y: panOffsetRef.current.y - e.deltaY,
        };
        setPanOffset(newPan);

        if (isHost && permissions.syncZoomGlobally) {
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
  }, [isHost, permissions.syncZoomGlobally, isSessionActive]);

  // Context properties based on current tool (Highlighter / Eraser / Pencil)
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
      ctx.globalAlpha = 0.35; // Translucent so text underneath is visible
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

  // Screen & Mic Recorder
  const startRecording = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true,
      });

      let audioStream;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {
        console.warn('Mic unavailable');
      }

      const tracks = [...screenStream.getVideoTracks()];
      if (audioStream && audioStream.getAudioTracks().length > 0) {
        tracks.push(audioStream.getAudioTracks()[0]);
      } else if (screenStream.getAudioTracks().length > 0) {
        tracks.push(screenStream.getAudioTracks()[0]);
      }

      const combinedStream = new MediaStream(tracks);
      recordedChunksRef.current = [];

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
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

  // Sticky Notes Logic
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

  // Google Handwriting & Shape Engine
  const recognizeAndDrawSmartShape = async (points, ctx) => {
    if (points.length < 5) return false;
    const start = points[0];
    const end = points[points.length - 1];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const distStartEnd = Math.hypot(end.x - start.x, end.y - start.y);

    // Line
    if (distStartEnd > Math.max(width, height) * 0.88 && points.length < 45) {
      drawShapeDirect(ctx, 'line', start.x, start.y, end.x, end.y);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'draw-shape',
        payload: { shapeTool: 'line', fromX: start.x, fromY: start.y, toX: end.x, toY: end.y, color, width: lineWidth },
      });
      return true;
    }

    // Closed shapes
    const isClosed = distStartEnd < Math.max(width, height) * 0.32;
    if (isClosed && width > 30 && height > 30) {
      const centerX = minX + width / 2;
      const centerY = minY + height / 2;
      const radius = (width + height) / 4;

      let radVariance = 0;
      points.forEach((p) => {
        const d = Math.hypot(p.x - centerX, p.y - centerY);
        radVariance += Math.abs(d - radius);
      });
      radVariance /= points.length;

      // Circle
      if (radVariance < radius * 0.22 && Math.abs(width - height) < Math.max(width, height) * 0.28) {
        drawShapeDirect(ctx, 'circle', centerX, centerY, centerX + radius, centerY);
        channelRef.current?.send({
          type: 'broadcast',
          event: 'draw-shape',
          payload: { shapeTool: 'circle', fromX: centerX, fromY: centerY, toX: centerX + radius, toY: centerY, color, width: lineWidth },
        });
        return true;
      }

      // Rectangle
      if (radVariance > radius * 0.35 && points.length > 20) {
        drawShapeDirect(ctx, 'rectangle', minX, minY, maxX, maxY);
        channelRef.current?.send({
          type: 'broadcast',
          event: 'draw-shape',
          payload: { shapeTool: 'rectangle', fromX: minX, fromY: minY, toX: maxX, toY: maxY, color, width: lineWidth },
        });
        return true;
      }
    }

    // Handwriting detection
    try {
      const strokeX = points.map((p) => Math.round(p.x));
      const strokeY = points.map((p) => Math.round(p.y));
      const strokeT = points.map((_, i) => i * 16);

      const requestBody = {
        app_version: 0.3,
        api_level: '533.0',
        device: window.navigator.userAgent,
        input_type: 0,
        options: 'enable_pre_space',
        requests: [
          {
            writing_guide: { writing_area_width: CANVAS_WIDTH, writing_area_height: CANVAS_HEIGHT },
            pre_context: '',
            max_num_results: 1,
            max_completions: 0,
            language: 'en',
            ink: [[strokeX, strokeY, strokeT]],
          },
        ],
      };

      const response = await fetch(
        'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();
      if (data && data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
        const recognizedChar = data[1][0][1][0];

        if (recognizedChar && recognizedChar.trim()) {
          const fontSize = Math.max(Math.round(height * 0.95), 26);
          const targetX = minX;
          const targetY = minY + height;

          ctx.font = `600 ${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = color;
          ctx.fillText(recognizedChar, targetX, targetY);

          channelRef.current?.send({
            type: 'broadcast',
            event: 'draw-text',
            payload: { text: recognizedChar, x: targetX, y: targetY, color, fontSize },
          });
          return true;
        }
      }
    } catch (err) {
      console.warn('Handwriting API fallback:', err);
    }

    return false;
  };

  // Laser Animation Loop
  useEffect(() => {
    let animId;
    const renderLaser = () => {
      const ctx = laserCtxRef.current;
      const canvas = laserCanvasRef.current;
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      laserPointsRef.current = laserPointsRef.current.filter((p) => now - p.time < 1200);

      const pts = laserPointsRef.current;
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        if (p2.isStart) continue;

        const age = now - p2.time;
        const opacity = Math.max(0, 1 - age / 1200);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(239, 68, 68, ${opacity})`;
        ctx.lineWidth = 6;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
      }

      animId = requestAnimationFrame(renderLaser);
    };

    animId = requestAnimationFrame(renderLaser);
    return () => cancelAnimationFrame(animId);
  }, []);

  const addLaserPoint = (x, y, isStart = false) => {
    laserPointsRef.current.push({ x, y, time: Date.now(), isStart });
  };

  // Chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMsg = {
      id: Date.now(),
      sender: `${isHost ? '👑 ' : '👤 '}${userName || (isHost ? 'Host' : 'Guest')}`,
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

  // Slide Snaps
  const captureBoardSnapshot = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!bgCanvas || !drawCanvas) return;

    const merged = document.createElement('canvas');
    merged.width = window.innerWidth;
    merged.height = window.innerHeight;
    const mCtx = merged.getContext('2d');

    mCtx.drawImage(
      bgCanvas,
      -panOffset.x / zoomScale,
      -panOffset.y / zoomScale,
      window.innerWidth / zoomScale,
      window.innerHeight / zoomScale,
      0,
      0,
      window.innerWidth,
      window.innerHeight
    );
    mCtx.drawImage(
      drawCanvas,
      -panOffset.x / zoomScale,
      -panOffset.y / zoomScale,
      window.innerWidth / zoomScale,
      window.innerHeight / zoomScale,
      0,
      0,
      window.innerWidth,
      window.innerHeight
    );

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
      alert('No slides captured! Click "📸 Snap" to capture slides first.');
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF generation engine loading, please try again.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [window.innerWidth, window.innerHeight],
    });

    savedSlides.forEach((slide, index) => {
      if (index > 0) doc.addPage([window.innerWidth, window.innerHeight], 'landscape');
      doc.addImage(slide.dataUrl, 'PNG', 0, 0, window.innerWidth, window.innerHeight);
    });

    doc.save(`StudySync-${roomId}-Lectures.pdf`);
  };

  const updateHostPermission = (key, value) => {
    const updated = { ...permissions, [key]: value };
    setPermissions(updated);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'permissions-update',
      payload: updated,
    });
  };

  const handleZoom = (delta) => {
    const newScale = Math.min(Math.max(Number((zoomScale + delta).toFixed(1)), 0.4), 3.0);
    setZoomScale(newScale);

    if (isHost && permissions.syncZoomGlobally) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'sync-view',
        payload: { scale: newScale, pan: panOffset },
      });
    }
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    if (isHost && permissions.syncZoomGlobally) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'sync-view',
        payload: { scale: 1, pan: { x: 0, y: 0 } },
      });
    }
  };

  // WebRTC
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(rtcConfig);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'webrtc-candidate',
          payload: { candidate: event.candidate },
        });
      }
    };
    pc.ontrack = (event) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
    };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    }
    peerConnectionRef.current = pc;
    return pc;
  };

  const startVoiceChat = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setIsMicOn(true);
      setIsVoiceConnected(true);

      const pc = createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      channelRef.current?.send({
        type: 'broadcast',
        event: 'webrtc-offer',
        payload: { offer },
      });
    } catch (err) {
      alert('Microphone access denied or unavailable.');
    }
  };

  const handleReceiveOffer = async (offer) => {
    let stream = localStreamRef.current;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        setIsMicOn(true);
        setIsVoiceConnected(true);
      } catch (err) {
        return;
      }
    }
    const pc = createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'webrtc-answer',
      payload: { answer },
    });
  };

  const toggleMic = () => {
    if (!localStreamRef.current) {
      startVoiceChat();
      return;
    }
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  };

  // Undo/Redo
  const broadcastCurrentState = () => {
    const drawCanvas = drawCanvasRef.current;
    const dataUrl = drawCanvas.toDataURL();
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sync-canvas-state',
      payload: { dataUrl },
    });
  };

  const loadCanvasDataUrl = (dataUrl) => {
    const img = new Image();
    img.onload = () => {
      const drawCanvas = drawCanvasRef.current;
      const ctx = drawCtxRef.current;
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  };

  const pushToHistory = () => {
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCtxRef.current;
    const currentData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(currentData);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const prevStep = historyStep - 1;
      const drawCtx = drawCtxRef.current;
      drawCtx.putImageData(history[prevStep], 0, 0);
      setHistoryStep(prevStep);
      broadcastCurrentState();
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const nextStep = historyStep + 1;
      const drawCtx = drawCtxRef.current;
      drawCtx.putImageData(history[nextStep], 0, 0);
      setHistoryStep(nextStep);
      broadcastCurrentState();
    }
  };

  useEffect(() => {
    if (textInput.visible && textInputRef.current) {
      setTimeout(() => textInputRef.current.focus(), 50);
    }
  }, [textInput.visible]);

  // Robust Single Page Document Rendering (Instant Sync, 0 Drop)
  const renderImageOnCanvas = (dataUrl) => {
    const img = new Image();
    img.onload = () => {
      const bgCanvas = bgCanvasRef.current;
      const bgCtx = bgCanvas.getContext('2d');

      bgCtx.fillStyle = '#ffffff';
      bgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Clean centered worksheet placement
      const x = Math.max(60, (window.innerWidth - img.width) / 2);
      bgCtx.drawImage(img, x, 40);
      setHasDocument(true);
    };
    img.src = dataUrl;
  };

  // Render 1 Page of PDF (Lightweight ~80KB, 100% Reliable over WebSocket)
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
    } catch (err) {
      console.error('PDF Page Render Error:', err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
          pdfDocRef.current = pdf;
          setNumPages(pdf.numPages);
          setPageNum(1);
          renderPdfSinglePage(pdf, 1, true);
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
      channelRef.current?.send({
        type: 'broadcast',
        event: 'delete-doc',
      });
    }
  };

  // OCR Extraction with Immediate Notes Pad Sync
  const extractTextFromRegion = async (x1, y1, x2, y2) => {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    if (width < 10 || height < 10) return;
    if (!window.Tesseract) {
      alert('OCR Engine loading, please wait 2 seconds.');
      return;
    }

    setIsExtracting(true);

    try {
      const bgCanvas = bgCanvasRef.current;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = width;
      cropCanvas.height = height;
      const cropCtx = cropCanvas.getContext('2d');

      cropCtx.drawImage(bgCanvas, minX, minY, width, height, 0, 0, width, height);

      const result = await window.Tesseract.recognize(cropCanvas, 'eng');
      const extractedText = result.data.text.trim();

      if (extractedText) {
        setSharedNotes((prev) => {
          const updated = prev ? `${prev}\n\n• ${extractedText}` : `• ${extractedText}`;
          channelRef.current?.send({
            type: 'broadcast',
            event: 'sync-notes',
            payload: { text: updated },
          });
          return updated;
        });

        setShowNotesPad(true);
        navigator.clipboard.writeText(extractedText);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsExtracting(false);
    }
  };

  // Notes Pad Handlers
  const handleNotesChange = (e) => {
    const text = e.target.value;
    setSharedNotes(text);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sync-notes',
      payload: { text },
    });
  };

  const copyNotesToClipboard = () => {
    navigator.clipboard.writeText(sharedNotes);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const downloadNotesFile = () => {
    const element = document.createElement('a');
    const file = new Blob([sharedNotes || 'No notes taken during this session.'], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${roomId}-study-notes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Remote Receivers
  const applyRemoteStroke = ({ fromX, fromY, toX, toY, color: remoteColor, width, isEraser, isHighlighter }) => {
    const ctx = drawCtxRef.current;
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    const prevColor = ctx.strokeStyle;
    const prevWidth = ctx.lineWidth;

    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1.0;
    } else if (isHighlighter) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
    }

    ctx.strokeStyle = remoteColor;
    ctx.lineWidth = width;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
    ctx.strokeStyle = prevColor;
    ctx.lineWidth = prevWidth;
  };

  const applyRemoteShape = ({ shapeTool, fromX, fromY, toX, toY, color: remoteColor, width }) => {
    const ctx = drawCtxRef.current;
    const prevColor = ctx.strokeStyle;
    const prevFill = ctx.fillStyle;
    const prevWidth = ctx.lineWidth;
    const prevOp = ctx.globalCompositeOperation;

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = remoteColor;
    ctx.fillStyle = remoteColor;
    ctx.lineWidth = width;

    drawShapeDirect(ctx, shapeTool, fromX, fromY, toX, toY);

    ctx.strokeStyle = prevColor;
    ctx.fillStyle = prevFill;
    ctx.lineWidth = prevWidth;
    ctx.globalCompositeOperation = prevOp;
  };

  const applyRemoteText = ({ text, x, y, color: remoteColor, fontSize }) => {
    const ctx = drawCtxRef.current;
    const prevFill = ctx.fillStyle;
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = remoteColor;
    ctx.fillText(text, x, y);
    ctx.fillStyle = prevFill;
  };

  const commitText = () => {
    if (!textInput.text.trim()) {
      setTextInput({ visible: false, x: 0, y: 0, text: '' });
      return;
    }
    const ctx = drawCtxRef.current;
    ctx.globalCompositeOperation = 'source-over';
    const fontSize = Math.max(lineWidth * 5, 20);
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = color;
    const targetY = textInput.y + fontSize * 0.8;
    ctx.fillText(textInput.text, textInput.x, targetY);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'draw-text',
      payload: { text: textInput.text, x: textInput.x, y: targetY, color, fontSize },
    });

    setTextInput({ visible: false, x: 0, y: 0, text: '' });
    pushToHistory();
  };

  // Real Infinite Coordinates Map
  const getCanvasCoords = (e) => {
    const rect = viewportRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panOffset.x) / zoomScale,
      y: (e.clientY - rect.top - panOffset.y) / zoomScale,
    };
  };

  const canUserDraw = isHost || permissions.canDraw;

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;

    if (tool === 'sticky') {
      const { x, y } = getCanvasCoords(e);
      addStickyNote(x, y);
      return;
    }

    if (tool === 'laser') {
      setIsDrawing(true);
      const { x, y } = getCanvasCoords(e);
      addLaserPoint(x, y, true);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'draw-laser',
        payload: { x, y },
      });
      return;
    }

    if (!canUserDraw && tool !== 'extract') return;

    const { x, y } = getCanvasCoords(e);
    setShowShapesMenu(false);
    setShowColorPalette(false);

    if (tool === 'text') {
      if (textInput.visible) commitText();
      setTextInput({ visible: true, x, y, text: '' });
      return;
    }

    if (textInput.visible) commitText();

    setIsDrawing(true);
    setStartPos({ x, y });

    const drawCanvas = drawCanvasRef.current;
    setSnapshot(drawCtxRef.current.getImageData(0, 0, drawCanvas.width, drawCanvas.height));

    if (['pencil', 'eraser', 'highlighter', 'smart'].includes(tool)) {
      currentStrokeRef.current = [{ x, y }];
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
      let cx = fromX;
      let cy = fromY;
      const step = Math.PI / spikes;

      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        let sx = cx + Math.cos(rot) * outerRadius;
        let sy = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(sx, sy);
        rot += step;
        sx = cx + Math.cos(rot) * innerRadius;
        sy = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(sx, sy);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      ctx.stroke();
    }
  };

  const handleMouseMove = (e) => {
    const { x, y } = getCanvasCoords(e);

    if (tool === 'laser' && isDrawing) {
      addLaserPoint(x, y);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'draw-laser',
        payload: { x, y },
      });
      return;
    }

    const canSendPointer = isHost || permissions.canSharePointer;
    if (shareMyPointer && canSendPointer) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'cursor-move',
        payload: { x, y, visible: true, name: userName || (isHost ? 'Host' : 'Guest') },
      });
    }

    if (!isDrawing) return;
    if (!canUserDraw && tool !== 'extract') return;

    const ctx = drawCtxRef.current;

    if (tool === 'pencil' || tool === 'eraser' || tool === 'highlighter') {
      ctx.lineTo(x, y);
      ctx.stroke();

      const isEraser = tool === 'eraser';
      const isHighlighter = tool === 'highlighter';

      channelRef.current?.send({
        type: 'broadcast',
        event: 'draw-stroke',
        payload: {
          fromX: startPos.x,
          fromY: startPos.y,
          toX: x,
          toY: y,
          color: isHighlighter ? (color === '#0f172a' ? '#facc15' : color) : color,
          width: isEraser ? lineWidth * 6 : isHighlighter ? lineWidth * 5 : lineWidth,
          isEraser,
          isHighlighter,
        },
      });
      setStartPos({ x, y });
    } else if (tool === 'smart') {
      ctx.lineTo(x, y);
      ctx.stroke();
      currentStrokeRef.current.push({ x, y });
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

  const handleMouseLeave = () => {
    if (shareMyPointer && (isHost || permissions.canSharePointer)) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'cursor-move',
        payload: { x: -100, y: -100, visible: false, name: '' },
      });
    }
    handleMouseUp();
  };

  const handleMouseUp = (e) => {
    if (tool === 'laser') {
      setIsDrawing(false);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

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

      if (snapshot) drawCtxRef.current.putImageData(snapshot, 0, 0);
      recognizeAndDrawSmartShape(strokePoints, drawCtxRef.current).then((converted) => {
        if (!converted && snapshot) {
          drawCtxRef.current.putImageData(snapshot, 0, 0);
        }
        pushToHistory();
      });
      return;
    }

    if (['pencil', 'eraser', 'highlighter'].includes(tool)) {
      drawCtxRef.current.closePath();
    } else {
      if (snapshot) drawCtxRef.current.putImageData(snapshot, 0, 0);
      drawShapeDirect(drawCtxRef.current, tool, startPos.x, startPos.y, x, y);

      channelRef.current?.send({
        type: 'broadcast',
        event: 'draw-shape',
        payload: {
          shapeTool: tool,
          fromX: startPos.x,
          fromY: startPos.y,
          toX: x,
          toY: y,
          color,
          width: lineWidth,
        },
      });
    }
    pushToHistory();
  };

  const clearCanvas = () => {
    if (!canUserDraw) return;
    const drawCanvas = drawCanvasRef.current;
    drawCtxRef.current.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    setTextInput({ visible: false, x: 0, y: 0, text: '' });
    pushToHistory();

    channelRef.current?.send({
      type: 'broadcast',
      event: 'clear-board',
    });
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}&host=false`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const isShapeActive = ['rectangle', 'circle', 'line', 'arrow', 'triangle', 'star'].includes(tool);

  // =========================================================================
  // 1. SHOW 3D RIBBON LOGIN MODAL IF SESSION NOT ACTIVE
  // =========================================================================
  if (!isSessionActive) {
    return (
      <AuthRoomModal
        onLaunchSession={handleLaunchSession}
        initialRoom={initialUrlRoom}
      />
    );
  }

  // =========================================================================
  // 2. DISPLAY EXACT SAME WHITEBOARD WORKSPACE (FIXED HEADER & DOCK LAYOUT)
  // =========================================================================
  return (
    <div className="relative w-screen h-screen overflow-hidden select-none font-['Inter',sans-serif] bg-slate-100 text-slate-800">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* FIXED TOP HEADER (Screen meeda cut avvakunda eppudu perfect ga kanipisthundi) */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 flex items-center justify-between z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-sm">
            S
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-900">StudySync</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isHost ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {isHost ? 'Host' : 'Guest'}
          </span>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
            #{roomId}
          </span>
        </div>

        {/* Center: Rec, Snap, Page Navigation */}
        <div className="flex items-center gap-2">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              <span>Record</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>REC {formatRecordingTime(recordingSeconds)}</span>
            </button>
          )}

          <button
            onClick={captureBoardSnapshot}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition flex items-center gap-1">
            <span>📸 Snap</span>
          </button>

          <button
            onClick={() => setShowSlidesDrawer(!showSlidesDrawer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${
              savedSlides.length > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}>
            <span>📑 Slides ({savedSlides.length})</span>
          </button>

          {/* Clean 1-Page PDF Navigation */}
          {numPages > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 ml-1">
              <button
                onClick={() => changePdfPage(-1)}
                disabled={pageNum <= 1}
                className="hover:text-blue-600 font-bold disabled:opacity-30">
                ◀
              </button>
              <span className="font-mono">{pageNum} / {numPages}</span>
              <button
                onClick={() => changePdfPage(1)}
                disabled={pageNum >= numPages}
                className="hover:text-blue-600 font-bold disabled:opacity-30">
                ▶
              </button>
            </div>
          )}

          {hasDocument && (
            <button
              onClick={() => resetBackgroundCanvas(true)}
              className="text-[11px] font-semibold text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition">
              Remove Doc
            </button>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChatPad(!showChatPad)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              showChatPad ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
            💬 Chat {messages.length > 0 ? `(${messages.length})` : ''}
          </button>

          <button
            onClick={() => setShowNotesPad(!showNotesPad)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              showNotesPad ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
            📝 Notes
          </button>

          <button
            onClick={toggleMic}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${
              isMicOn ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}>
            {isMicOn ? '🎙️ Mic ON' : '📞 Voice'}
          </button>

          {isHost && (
            <button
              onClick={() => setShowPermissionsModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 transition">
              🛡️
            </button>
          )}

          <button
            onClick={copyInviteLink}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition">
            {copiedLink ? '✓ Copied' : '🔗 Share'}
          </button>
        </div>
      </header>

      {/* FIXED BOTTOM FLOATING WORKSPACE DOCK */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-slate-200/90 rounded-2xl px-4 py-2 flex items-center gap-3 z-40">
        {/* Natural Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl text-xs font-mono">
          <button onClick={() => handleZoom(-0.1)} className="hover:text-blue-600 font-bold px-1">−</button>
          <span>{Math.round(zoomScale * 100)}%</span>
          <button onClick={() => handleZoom(0.1)} className="hover:text-blue-600 font-bold px-1">+</button>
          {(zoomScale !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
            <button onClick={handleResetZoom} className="text-[10px] text-blue-600 font-semibold ml-1">Reset</button>
          )}
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        {/* Pens, Transparent Highlighter & Laser */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setTool('pencil'); setShowShapesMenu(false); }}
            title="Pen"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
              tool === 'pencil' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'
            }`}>
            ✏️
          </button>

          <button
            onClick={() => { setTool('highlighter'); setShowShapesMenu(false); }}
            title="Highlighter: Transparent ink shows back text"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
              tool === 'highlighter' ? 'bg-yellow-400 text-yellow-950 shadow-sm font-bold' : 'hover:bg-slate-100'
            }`}>
            🖍️
          </button>

          <button
            onClick={() => { setTool('smart'); setShowShapesMenu(false); }}
            title="Smart Pen: Auto converts rough ink to crisp shapes & alphanumeric text"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
              tool === 'smart' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'
            }`}>
            ✨
          </button>

          <button
            onClick={() => { setTool('laser'); setShowShapesMenu(false); }}
            title="Fading Laser Pointer"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
              tool === 'laser' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'
            }`}>
            ⚡
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        {/* Elements, Text & Sticky Notes */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowShapesMenu(!showShapesMenu)}
              title="Shapes"
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
                isShapeActive ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'
              }`}>
              ⬡
            </button>

            {showShapesMenu && (
              <div className="absolute bottom-12 left-0 bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 grid grid-cols-2 gap-1 w-36 z-50">
                {[
                  { id: 'rectangle', label: '▭ Box' },
                  { id: 'circle', label: '⭕ Circle' },
                  { id: 'line', label: '― Line' },
                  { id: 'arrow', label: '➔ Arrow' },
                  { id: 'triangle', label: '▲ Triangle' },
                  { id: 'star', label: '★ Star' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setTool(s.id); setShowShapesMenu(false); }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium text-left transition ${
                      tool === s.id ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-slate-100'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => { setTool('text'); setShowShapesMenu(false); }}
            title="Text Box"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition ${
              tool === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'
            }`}>
            T
          </button>

          <button
            onClick={() => { setTool('sticky'); setShowShapesMenu(false); }}
            title="Drop Sticky Note"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
              tool === 'sticky' ? 'bg-yellow-400 text-yellow-950 shadow-sm' : 'hover:bg-slate-100'
            }`}>
            📌
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        {/* Upload Doc & OCR */}
        <div className="flex items-center gap-1">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" className="hidden" />
          <button
            onClick={() => fileInputRef.current.click()}
            title="Upload Multi-page PDF or Worksheet"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm hover:bg-slate-100 transition">
            📄
          </button>
          <button
            onClick={() => { setTool('extract'); setShowShapesMenu(false); }}
            title="OCR Extract text to Notes Pad"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
              tool === 'extract' ? 'bg-purple-600 text-white shadow-sm' : 'hover:bg-slate-100'
            }`}>
            🔍
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200" />

        {/* Color Palette, Eraser & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowColorPalette(!showColorPalette)}
              className="w-6 h-6 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-300"
              style={{ backgroundColor: color }}
            />
            {showColorPalette && (
              <div className="absolute bottom-12 left-0 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 grid grid-cols-4 gap-1.5 z-50">
                {paletteColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setShowColorPalette(false); }}
                    className="w-6 h-6 rounded-lg transition hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>

          <input
            type="range"
            min="1"
            max="12"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="w-16 accent-blue-600 cursor-pointer"
          />

          <button
            onClick={() => { setTool('eraser'); setShowShapesMenu(false); }}
            title="Eraser"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition ${
              tool === 'eraser' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'
            }`}>
            🧹
          </button>

          <button onClick={handleUndo} disabled={historyStep <= 0} title="Undo" className="w-7 h-7 flex items-center justify-center disabled:opacity-30 text-slate-700">↶</button>
          <button onClick={handleRedo} disabled={historyStep >= history.length - 1} title="Redo" className="w-7 h-7 flex items-center justify-center disabled:opacity-30 text-slate-700">↷</button>
          <button onClick={clearCanvas} title="Clear Whiteboard" className="text-xs font-bold text-rose-500 hover:text-rose-700 ml-1">Clear</button>
        </div>
      </div>

      {/* SLIDES GALLERY DRAWER */}
      {showSlidesDrawer && (
        <div className="fixed top-16 left-6 w-80 max-h-[75vh] bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 rounded-2xl p-4 z-40 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
            <span className="font-bold text-xs">📑 Snapped Slides ({savedSlides.length})</span>
            <button onClick={() => setShowSlidesDrawer(false)} className="text-xs text-slate-400 font-bold hover:text-slate-600">✕</button>
          </div>

          {savedSlides.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No slides snapped yet. Click "📸 Snap" above!</div>
          ) : (
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
              {savedSlides.map((slide) => (
                <div key={slide.id} className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                  <img src={slide.dataUrl} alt={slide.title} className="w-16 h-12 object-cover rounded-lg border border-slate-200 bg-white" />
                  <div className="flex-1">
                    <div className="text-xs font-bold">{slide.title}</div>
                    <div className="text-[10px] text-slate-400">{slide.timestamp}</div>
                  </div>
                  <button onClick={() => setSavedSlides((prev) => prev.filter((s) => s.id !== slide.id))} className="text-slate-400 hover:text-rose-600 text-xs px-1">✕</button>
                </div>
              ))}
            </div>
          )}

          {savedSlides.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
              <button onClick={exportSlidesToPdf} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition">
                Extract All as PDF
              </button>
              <button onClick={() => setSavedSlides([])} className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-semibold transition">
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* LIVE IN-ROOM CHAT DRAWER */}
      {showChatPad && (
        <div className="fixed top-16 right-6 w-80 h-[480px] bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 rounded-2xl p-4 z-40 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="font-bold text-xs flex items-center gap-1.5">💬 In-Room Chat</span>
            <button onClick={() => setShowChatPad(false)} className="text-xs text-slate-400 font-bold hover:text-slate-600">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 p-1 text-xs">
            {messages.length === 0 && <div className="text-center py-12 text-slate-400 text-xs">No doubts yet. Ask a question!</div>}
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
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Type doubt..."
              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition">
              Send
            </button>
          </form>
        </div>
      )}

      {/* QUICK NOTES PANEL */}
      {showNotesPad && (
        <div className="fixed top-16 right-6 w-80 bg-white/95 backdrop-blur shadow-2xl border border-slate-200 rounded-2xl p-4 z-40 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="font-bold text-xs">📝 Study Notes Pad</span>
            <button onClick={() => setShowNotesPad(false)} className="text-xs text-slate-400 font-bold hover:text-slate-600">✕</button>
          </div>

          <textarea
            value={sharedNotes}
            onChange={handleNotesChange}
            onKeyDown={(e) => e.stopPropagation()}
            onPaste={(e) => e.stopPropagation()}
            placeholder="Type or OCR-extract text here..."
            className="w-full h-72 bg-slate-50/80 p-3 rounded-xl resize-none border border-slate-200 outline-none text-xs leading-relaxed font-mono select-text transition"
          />

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <button onClick={copyNotesToClipboard} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold transition">
              {copySuccess ? '✓ Copied' : 'Copy'}
            </button>
            <button onClick={downloadNotesFile} className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition">
              💾 Save (.txt)
            </button>
          </div>
        </div>
      )}

      {/* HOST PERMISSIONS MODAL */}
      {showPermissionsModal && isHost && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Room Permissions (Host)</h3>
                <p className="text-[11px] text-slate-500">Control guest permissions across screens</p>
              </div>
              <button onClick={() => setShowPermissionsModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">Sync Zoom & Scroll Globally</div>
                  <div className="text-[11px] text-slate-500">Guests mirror your document scroll & zoom</div>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.syncZoomGlobally}
                  onChange={(e) => updateHostPermission('syncZoomGlobally', e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">Allow Guests to Draw</div>
                  <div className="text-[11px] text-slate-500">Guests can write & draw shapes</div>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.canDraw}
                  onChange={(e) => updateHostPermission('canDraw', e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">Show Guest Pointers</div>
                  <div className="text-[11px] text-slate-500">Display laser mouse pointers</div>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.canSharePointer}
                  onChange={(e) => updateHostPermission('canSharePointer', e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={() => setShowPermissionsModal(false)}
              className="mt-6 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition">
              Apply Changes
            </button>
          </div>
        </div>
      )}

      {/* Snap & OCR Status */}
      {snapNotice && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg animate-bounce">
          ✓ Slide captured to in-app gallery!
        </div>
      )}

      {isExtracting && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2">
          <span>⚙️ Reading text from worksheet...</span>
        </div>
      )}

      {/* Text Box Input */}
      {textInput.visible && (
        <div
          style={{
            left: `${textInput.x * zoomScale + panOffset.x}px`,
            top: `${textInput.y * zoomScale + panOffset.y}px`,
            transformOrigin: 'top left',
            transform: `scale(${zoomScale})`,
          }}
          className="absolute z-30 bg-white/90 p-1 rounded border border-blue-400 shadow-md">
          <input
            ref={textInputRef}
            type="text"
            value={textInput.text}
            onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') setTextInput({ visible: false, x: 0, y: 0, text: '' });
            }}
            placeholder="Type text & hit Enter..."
            style={{
              color: color,
              fontSize: `${Math.max(lineWidth * 5, 20)}px`,
            }}
            className="bg-transparent border-none outline-none font-semibold min-w-[200px]"
          />
        </div>
      )}

      {/* Remote Cursor Pointer */}
      {remoteCursor.visible && (
        <div
          style={{
            transform: `translate(${remoteCursor.x * zoomScale + panOffset.x}px, ${
              remoteCursor.y * zoomScale + panOffset.y
            }px)`,
            transition: 'transform 0.04s linear',
          }}
          className="absolute top-0 left-0 pointer-events-none z-30 flex items-center gap-1">
          <svg className="w-4 h-4 text-blue-600 filter drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 2l18 9-9 3-4 8z" />
          </svg>
          <span className="bg-blue-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded shadow">
            {remoteCursor.name}
          </span>
        </div>
      )}

      {/* INFINITE EXPANDING CANVAS VIEWPORT (With pt-14 to never get hidden by Header) */}
      <div
        ref={viewportRef}
        className="absolute inset-0 w-screen h-screen overflow-hidden pt-14 cursor-crosshair z-0">
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
            transformOrigin: 'top left',
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
          }}
          className="relative top-0 left-0">
          <canvas ref={bgCanvasRef} className="absolute top-0 left-0 pointer-events-none z-0 shadow-sm" />
          <canvas
            ref={drawCanvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            className={`absolute top-0 left-0 z-10 ${
              tool === 'laser'
                ? 'cursor-pointer'
                : tool === 'highlighter'
                ? 'cursor-crosshair'
                : tool === 'sticky'
                ? 'cursor-copy'
                : !canUserDraw && tool !== 'extract'
                ? 'cursor-not-allowed'
                : tool === 'text'
                ? 'cursor-text'
                : tool === 'extract'
                ? 'cursor-cell'
                : 'cursor-crosshair'
            }`}
          />
          <canvas ref={laserCanvasRef} className="absolute top-0 left-0 pointer-events-none z-20" />

          {/* Sticky Notes */}
          {stickyNotes.map((note) => (
            <div
              key={note.id}
              style={{
                left: `${note.x}px`,
                top: `${note.y}px`,
                backgroundColor: note.bgColor,
              }}
              className="absolute z-25 w-44 min-h-[110px] p-2.5 rounded-xl shadow-lg border border-yellow-300 text-slate-800 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-yellow-800 tracking-wider">📌 NOTE</span>
                <button onClick={() => deleteStickyNote(note.id)} className="text-xs font-bold text-yellow-800 hover:text-rose-600">✕</button>
              </div>
              <textarea
                defaultValue={note.text}
                onBlur={(e) => updateStickyText(note.id, e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full bg-transparent resize-none border-none outline-none text-xs text-slate-800 leading-snug"
                rows={3}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}