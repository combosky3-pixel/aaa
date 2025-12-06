export interface FluidConfig {
  reflectionIntensity: number; // 0 to 1
  refractionIndex: number;     // 0 to 1 (visual approximation)
  distortionStrength: number;  // 0 to 2
  waveHeight: number;          // 0 to 1
  dynamicSpeed: number;        // 0.1 to 2.0
  rippleEffectStrength: number;// 0 to 1
  viscosity: number;           // 0.8 to 0.99 (Fade factor)
}

export interface HandState {
  isPinching: boolean;
  x: number;
  y: number;
  depth: number; // Estimated distance from camera (0 to 1)
}

export enum AppStatus {
  LOADING = 'LOADING',
  READY = 'READY',
  ERROR = 'ERROR'
}
