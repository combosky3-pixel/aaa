import React from 'react';
import { FluidConfig } from '../types';

interface ControlPanelProps {
  config: FluidConfig;
  onChange: (key: keyof FluidConfig, value: number) => void;
  fps: number;
}

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs text-gray-400 mb-1">
      <span>{label}</span>
      <span>{value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer focus:outline-none accent-cyan-500"
    />
  </div>
);

export const ControlPanel: React.FC<ControlPanelProps> = ({ config, onChange, fps }) => {
  return (
    <div className="absolute top-4 right-4 w-72 bg-black/40 backdrop-blur-xl border border-white/10 p-5 rounded-2xl text-white shadow-2xl z-50">
      <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-cyan-400">Parameter Control</h2>
        <span className="text-xs font-mono text-green-400">{Math.round(fps)} FPS</span>
      </div>

      <div className="space-y-1">
        <Slider
          label="Viscosity (Magma Trail)"
          value={config.viscosity}
          min={0.80}
          max={0.99}
          step={0.01}
          onChange={(v) => onChange('viscosity', v)}
        />
        <Slider
          label="Distortion Strength"
          value={config.distortionStrength}
          min={0}
          max={2.0}
          step={0.05}
          onChange={(v) => onChange('distortionStrength', v)}
        />
        <Slider
          label="Refraction Index"
          value={config.refractionIndex}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange('refractionIndex', v)}
        />
        <Slider
          label="Reflection Intensity"
          value={config.reflectionIntensity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange('reflectionIntensity', v)}
        />
        <Slider
          label="Wave Height"
          value={config.waveHeight}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange('waveHeight', v)}
        />
        <Slider
          label="Ripple Strength"
          value={config.rippleEffectStrength}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange('rippleEffectStrength', v)}
        />
      </div>
      
      <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-gray-500 leading-tight">
        Interaction: Use Thumb & Index finger to pinch/touch the air.
        <br />
        Sound: Increases with proximity.
      </div>
    </div>
  );
};
