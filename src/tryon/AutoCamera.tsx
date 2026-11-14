// Real-time face tracking (Google ML Kit through Vision Camera). Needs a native build (EAS / expo run), not Expo Go.
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { Camera } from 'react-native-vision-camera-face-detector';
import type { Face } from 'react-native-vision-camera-face-detector';
import type { FaceSample } from './fit';

export function useAutoPermission() {
  const p = useCameraPermission();
  return { granted: p.hasPermission, loading: false, request: () => { p.requestPermission(); } };
}

export function toSample(f: Face): FaceSample {
  return {
    leftEye: f.landmarks?.LEFT_EYE, rightEye: f.landmarks?.RIGHT_EYE,
    bounds: f.bounds, yawDeg: f.yawAngle,
  };
}

/** A still from the camera. `mirror` = the image must be flipped horizontally to look like the (mirrored) front preview. */
export type Shot = { uri: string; mirror: boolean };
export type ShootFn = () => Promise<Shot | null>;

export function AutoCamera({ facing, active, onFace, onError, shootRef }: {
  facing: 'front' | 'back'; active: boolean;
  onFace: (s: FaceSample | null) => void;
  onError?: (e: unknown) => void;
  shootRef?: React.MutableRefObject<ShootFn | null>;
}) {
  const device = useCameraDevice(facing);
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'speed' });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const handle = useCallback((faces: Face[]) => {
    if (!alive.current) return;
    if (faces.length === 0) { onFace(null); return; }
    // The largest face is the person trying the glasses on.
    const best = faces.reduce((a, b) => (b.bounds.width * b.bounds.height > a.bounds.width * a.bounds.height ? b : a));
    onFace(toSample(best));
  }, [onFace]);

  const fail = useCallback((e: unknown) => { if (alive.current) { onFace(null); onError?.(e); } }, [onFace, onError]);

  useEffect(() => {
    if (!shootRef) return;
    shootRef.current = async () => {
      let photo: Awaited<ReturnType<typeof photoOutput.capturePhoto>> | null = null;
      try {
        photo = await photoOutput.capturePhoto({ flashMode: 'off' }, {});
        const uri = await photo.saveToTemporaryFileAsync();
        // Raw photos are un-mirrored for the front camera while the preview is mirrored: flip to match what the user saw.
        return { uri: uri.startsWith('file://') ? uri : `file://${uri}`, mirror: facing === 'front' && !photo.isMirrored };
      } catch {
        return null; // caller falls back to a screen capture
      } finally {
        try { photo?.dispose(); } catch { /* already disposed */ }
      }
    };
    return () => { shootRef.current = null; };
  }, [shootRef, photoOutput, facing]);

  if (!device) return null;
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={active}
      cameraFacing={facing}
      outputs={[photoOutput]}
      autoMode
      runLandmarks
      performanceMode="fast"
      minFaceSize={0.2}
      onFacesDetected={handle}
      onError={fail}
    />
  );
}
