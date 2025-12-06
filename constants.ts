import { FluidConfig } from './types';

export const DEFAULT_CONFIG: FluidConfig = {
  reflectionIntensity: 0.6,
  refractionIndex: 0.4,
  distortionStrength: 0.8,
  waveHeight: 0.5,
  dynamicSpeed: 1.0,
  rippleEffectStrength: 0.7,
  viscosity: 0.96, // High viscosity (Magma-like)
};

// MediaPipe Hands model asset path
export const HAND_LANDMARKER_TASK_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
