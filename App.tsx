import React, { useState } from 'react';
import { FluidCanvas } from './components/FluidCanvas';
import { ControlPanel } from './components/ControlPanel';
import { FluidConfig, AppStatus } from './types';
import { DEFAULT_CONFIG } from './constants';

const App: React.FC = () => {
  const [config, setConfig] = useState<FluidConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<AppStatus>(AppStatus.LOADING);
  const [fps, setFps] = useState<number>(0);

  const handleConfigChange = (key: keyof FluidConfig, value: number) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black text-white selection:bg-cyan-500 selection:text-black">
      {/* Loading Overlay */}
      {status === AppStatus.LOADING && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
          <h1 className="text-xl font-light tracking-[0.2em] text-cyan-100">INITIALIZING FLUID ENGINE</h1>
          <p className="text-xs text-gray-500 mt-2">Loading Computer Vision Models...</p>
        </div>
      )}

      {/* Error Overlay */}
      {status === AppStatus.ERROR && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900">
          <div className="text-center max-w-md p-6">
            <h2 className="text-red-500 text-2xl mb-2">System Error</h2>
            <p className="text-gray-400">Could not access camera or load AI models. Please ensure you have granted camera permissions and are using a modern browser.</p>
          </div>
        </div>
      )}

      {/* Main Experience */}
      <FluidCanvas 
        config={config} 
        onStatusChange={setStatus} 
        onFpsUpdate={setFps}
      />

      {/* UI Layer */}
      {status === AppStatus.READY && (
        <ControlPanel 
          config={config} 
          onChange={handleConfigChange}
          fps={fps}
        />
      )}
      
      <div className="fixed bottom-4 right-4 pointer-events-none z-10">
        <div className="text-[10px] text-white/20 font-mono">
            MAGMA-FLUID-SIM v1.0 <br/>
            POWERED BY REACT + WEBGL
        </div>
      </div>
    </div>
  );
};

export default App;
