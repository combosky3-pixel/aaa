import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm';
import { FluidConfig, AppStatus, HandState } from '../types';
import { HAND_LANDMARKER_TASK_URL } from '../constants';
import { AudioEngine } from '../services/audioEngine';

interface FluidCanvasProps {
  config: FluidConfig;
  onStatusChange: (status: AppStatus) => void;
  onFpsUpdate: (fps: number) => void;
}

// Simple Vertex Shader
const VERT_SHADER = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    // Flip Y for texture mapping
    vUv.y = 1.0 - vUv.y;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Fluid/Magma Fragment Shader
const FRAG_SHADER = `
  precision mediump float;
  
  uniform sampler2D uCamera;
  uniform sampler2D uTrail; // The drawing/trail canvas
  
  uniform float uTime;
  uniform float uRefraction;
  uniform float uReflection;
  uniform float uDistortion;
  uniform float uWaveHeight;
  uniform float uRippleStrength;
  
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    
    // Sample trail map (grayscale)
    vec4 trailColor = texture2D(uTrail, uv);
    float flow = trailColor.r; // 0 to 1 intensity
    
    // Calculate normal from trail gradient (simple approximation)
    // We check neighbors to get a "slope"
    float offset = 0.005;
    float left = texture2D(uTrail, uv + vec2(-offset, 0.0)).r;
    float right = texture2D(uTrail, uv + vec2(offset, 0.0)).r;
    float top = texture2D(uTrail, uv + vec2(0.0, -offset)).r;
    float bottom = texture2D(uTrail, uv + vec2(0.0, offset)).r;
    
    vec2 normal = vec2(left - right, top - bottom);
    
    // --- Distortion Logic ---
    // Base liquid wobble
    float wobble = sin(uv.y * 10.0 + uTime) * 0.002 * uWaveHeight;
    
    // Interaction distortion (Magma drag)
    vec2 interactionOffset = normal * uDistortion * uRippleStrength;
    
    vec2 distortedUv = uv + interactionOffset + vec2(wobble, 0.0);
    
    // Clamp UVs
    distortedUv = clamp(distortedUv, 0.0, 1.0);
    
    // Sample Camera with new UVs (Refraction)
    vec4 camera = texture2D(uCamera, distortedUv);
    
    // --- Reflection/Lighting Logic ---
    // Specular highlight based on the "slope" of the liquid
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    vec3 surfaceNormal = normalize(vec3(normal * 5.0, 1.0)); // Amplify normal for visual effect
    
    float specular = max(0.0, dot(surfaceNormal, lightDir));
    specular = pow(specular, 10.0); // Sharpen highlight
    
    // Mix Colors
    vec3 finalColor = camera.rgb;
    
    // Add "Liquid" tint based on trail intensity (optional, gives glass look)
    // finalColor += vec3(0.1, 0.2, 0.3) * flow * 0.2;
    
    // Apply reflection (additive)
    finalColor += vec3(1.0) * specular * uReflection * flow;
    
    // Debug: show trail
    // gl_FragColor = vec4(vec3(flow), 1.0);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export const FluidCanvas: React.FC<FluidCanvasProps> = ({ config, onStatusChange, onFpsUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null); // Offscreen canvas for drawing trails
  
  const audioEngineRef = useRef<AudioEngine>(new AudioEngine());
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // WebGL Context Refs
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRefs = useRef<{ camera: WebGLTexture | null, trail: WebGLTexture | null }>({ camera: null, trail: null });

  useEffect(() => {
    const init = async () => {
      onStatusChange(AppStatus.LOADING);
      
      // 1. Setup Camera
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (err) {
        console.error("Camera error:", err);
        onStatusChange(AppStatus.ERROR);
        return;
      }

      // 2. Setup MediaPipe
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: HAND_LANDMARKER_TASK_URL,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
      } catch (err) {
        console.error("MediaPipe error:", err);
        onStatusChange(AppStatus.ERROR);
        return;
      }

      // 3. Setup WebGL
      initWebGL();

      // 4. Start Loop
      onStatusChange(AppStatus.READY);
      audioEngineRef.current.start();
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(animate);
    };

    init();

    return () => {
      cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      audioEngineRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initWebGL = () => {
    const canvas = canvasRef.current;
    const trailCanvas = trailCanvasRef.current;
    if (!canvas || !trailCanvas) return;

    // Match dimensions to window (or fixed aspect)
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    trailCanvas.width = 512; // Lower res for soft liquid feel
    trailCanvas.height = 512;

    const gl = canvas.getContext('webgl');
    if (!gl) return;
    glRef.current = gl;

    // Compile Shaders
    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vert = createShader(gl.VERTEX_SHADER, VERT_SHADER);
    const frag = createShader(gl.FRAGMENT_SHADER, FRAG_SHADER);
    if (!vert || !frag) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    // Buffer Setup (Full screen quad)
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Texture Setup
    const createTexture = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    };

    textureRefs.current.camera = createTexture();
    textureRefs.current.trail = createTexture();
  };

  const updateTrails = (hands: any[]) => {
    const trailCtx = trailCanvasRef.current?.getContext('2d');
    if (!trailCtx || !trailCanvasRef.current) return;

    // 1. Fade out existing trails (Viscosity simulation)
    // A lower opacity fill simulates high viscosity (trails stick around longer)
    const fade = 1.0 - config.viscosity; // e.g. 1.0 - 0.96 = 0.04 fade per frame
    trailCtx.globalCompositeOperation = 'source-over';
    trailCtx.fillStyle = `rgba(0, 0, 0, ${fade})`;
    trailCtx.fillRect(0, 0, trailCanvasRef.current.width, trailCanvasRef.current.height);

    // 2. Draw new interaction
    trailCtx.globalCompositeOperation = 'lighter';
    trailCtx.filter = 'blur(12px)'; // Soften the liquid brush
    
    let maxDepth = 0;
    let anyPinch = false;

    if (hands) {
      for (const hand of hands) {
        // Index finger tip (8) and Thumb tip (4)
        const indexTip = hand[8];
        const thumbTip = hand[4];
        
        if (indexTip && thumbTip) {
          // Check pinch distance
          const dx = indexTip.x - thumbTip.x;
          const dy = indexTip.y - thumbTip.y;
          const distance = Math.sqrt(dx*dx + dy*dy);
          
          const isPinching = distance < 0.1;
          
          // Calculate screen position
          const x = (indexTip.x + thumbTip.x) / 2 * trailCanvasRef.current.width;
          const y = (indexTip.y + thumbTip.y) / 2 * trailCanvasRef.current.height;
          
          // Estimate depth 
          // MediaPipe Z is relative to wrist. Negative is closer to camera.
          // We normalize this to a 0-1 range for volume and visual intensity.
          // Assuming typical range -0.1 to 0.1 for interaction depth
          const z = Math.abs(indexTip.z); 
          // Depth intensity: 1.0 when close, 0 when far. 
          // Adjusted multiplier to make it more sensitive to "moving forward"
          const depthIntensity = Math.min(1, Math.max(0, 1.0 - z * 8)); 
          
          maxDepth = Math.max(maxDepth, depthIntensity);
          if (isPinching) anyPinch = true;

          // Trigger interaction if pinching OR if hand is significantly close (pushing the liquid)
          if (isPinching || depthIntensity > 0.3) {
            // Draw blob
            const radius = 30 + (depthIntensity * 60);
            // Create a "hot" center for the magma feel
            const gradient = trailCtx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(255, 150, 50, ${0.8 * config.rippleEffectStrength})`); 
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            trailCtx.fillStyle = gradient;
            trailCtx.beginPath();
            trailCtx.arc(x, y, radius, 0, Math.PI * 2);
            trailCtx.fill();
          }
        }
      }
    }
    
    trailCtx.filter = 'none';

    // Update Audio
    audioEngineRef.current.update(maxDepth, anyPinch);
  };

  const animate = (time: number) => {
    const gl = glRef.current;
    const program = programRef.current;
    
    // FPS calc
    const delta = time - lastTimeRef.current;
    if (delta > 0) {
      onFpsUpdate(1000 / delta);
    }
    lastTimeRef.current = time;

    // 1. Detect Hands
    if (handLandmarkerRef.current && videoRef.current && videoRef.current.videoWidth > 0) {
        const results = handLandmarkerRef.current.detectForVideo(videoRef.current, time);
        updateTrails(results.landmarks);
    }

    // 2. Render WebGL
    if (gl && program && videoRef.current && trailCanvasRef.current) {
      gl.useProgram(program);

      // Upload Camera Texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textureRefs.current.camera);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoRef.current);
      gl.uniform1i(gl.getUniformLocation(program, "uCamera"), 0);

      // Upload Trail Texture
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textureRefs.current.trail);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trailCanvasRef.current);
      gl.uniform1i(gl.getUniformLocation(program, "uTrail"), 1);

      // Uniforms
      gl.uniform1f(gl.getUniformLocation(program, "uTime"), time * 0.001 * config.dynamicSpeed);
      gl.uniform1f(gl.getUniformLocation(program, "uRefraction"), config.refractionIndex);
      gl.uniform1f(gl.getUniformLocation(program, "uReflection"), config.reflectionIntensity);
      gl.uniform1f(gl.getUniformLocation(program, "uDistortion"), config.distortionStrength);
      gl.uniform1f(gl.getUniformLocation(program, "uWaveHeight"), config.waveHeight);
      gl.uniform1f(gl.getUniformLocation(program, "uRippleStrength"), config.rippleEffectStrength);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  const handleResize = () => {
    if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        glRef.current?.viewport(0, 0, window.innerWidth, window.innerHeight);
    }
  };

  const enableAudio = () => {
    audioEngineRef.current.resume();
    setAudioEnabled(true);
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    // Auto-attempt resume on click
    window.addEventListener('click', enableAudio);
    window.addEventListener('touchstart', enableAudio);
    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('click', enableAudio);
        window.removeEventListener('touchstart', enableAudio);
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black touch-none">
      {/* Hidden Source Video */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />
      {/* Offscreen Trail Canvas (Debug: remove 'hidden' to see the trail map) */}
      <canvas ref={trailCanvasRef} className="hidden fixed top-0 left-0 border border-red-500 z-50 w-64 h-64" />
      
      {/* Main Display Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
      
      {/* Initial Audio Prompt - Fades out once active */}
      {!audioEnabled && (
        <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none">
          <div className="bg-black/50 text-white/70 px-4 py-2 rounded-full backdrop-blur-md text-xs border border-white/10 animate-pulse">
            Tap screen to enable immersive audio
          </div>
        </div>
      )}
    </div>
  );
};