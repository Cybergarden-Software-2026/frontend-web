import jsQR from 'jsqr';

/** Retain detail when a dense sidebar QR occupies only part of the camera view. */
export function decodeCameraFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Canvas unavailable');
  for (const fraction of [1, .65]) {
    const width = video.videoWidth * fraction, height = video.videoHeight * fraction;
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(video, (video.videoWidth-width)/2, (video.videoHeight-height)/2, width, height, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(image.data, image.width, image.height, {inversionAttempts: 'attemptBoth'});
    if (result?.data) return result.data;
  }
  return null;
}

export async function startQrCamera(video: HTMLVideoElement, signal: AbortSignal, onCode: (code: string) => void, onReady: () => void) {
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };
  signal.addEventListener('abort', stop, {once: true});
  try {
    stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false});
    if (signal.aborted) { stop(); return; }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (signal.aborted) { stop(); return; }
    onReady();
    const canvas = document.createElement('canvas');
    // Frame errors must reach the UI, including failures on later timer ticks.
    await new Promise<void>((resolve, reject) => {
      signal.addEventListener('abort', () => resolve(), {once: true});
      const scan = () => {
        if (signal.aborted) { resolve(); return; }
        try {
          const result = decodeCameraFrame(video, canvas);
          if (result) { stop(); onCode(result); resolve(); return; }
          timer = setTimeout(scan, 250);
        } catch (error) { reject(error); }
      };
      scan();
    });
  } finally {
    stop();
    signal.removeEventListener('abort', stop);
  }
}
