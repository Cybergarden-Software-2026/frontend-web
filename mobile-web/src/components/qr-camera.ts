import jsQR from 'jsqr';

/** Retain detail when a dense sidebar QR occupies only part of the camera view. */
export function decodeCameraFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  return decodeQrImage(video, video.videoWidth, video.videoHeight, canvas);
}

export function decodeQrImage(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, canvas: HTMLCanvasElement): string | null {
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('Canvas unavailable');
  for (const fraction of [1, .65]) {
    const width = sourceWidth * fraction, height = sourceHeight * fraction;
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(source, (sourceWidth-width)/2, (sourceHeight-height)/2, width, height, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(image.data, image.width, image.height, {inversionAttempts: 'attemptBoth'});
    if (result?.data) return result.data;
  }
  return null;
}

/** play() can stay pending forever in an iOS Home Screen web app. */
export function waitForCameraPreview(video: HTMLVideoElement, signal: AbortSignal, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    let complete = false, frameArrived = false, frameId: number | undefined;
    const supportsFrameCallback = typeof video.requestVideoFrameCallback === 'function';
    const events = ['loadedmetadata', 'loadeddata', 'playing', 'resize'];
    const clean = () => {
      clearTimeout(timeout); clearInterval(poll);
      events.forEach(name => video.removeEventListener(name, check));
      video.removeEventListener('loadedmetadata', play);
      signal.removeEventListener('abort', abort);
      if (frameId !== undefined) video.cancelVideoFrameCallback?.(frameId);
    };
    const finish = (error?: Error) => {
      if (complete) return;
      complete = true; clean();
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused && (!supportsFrameCallback || frameArrived)) finish();
    };
    const play = () => {
      if (complete) return;
      void video.play().then(check).catch(() => {
        if (!signal.aborted) finish(new Error('CAMERA_PREVIEW_UNAVAILABLE'));
      });
    };
    const abort = () => finish(new DOMException('Camera closed', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('CAMERA_PREVIEW_UNAVAILABLE')), timeoutMs);
    const poll = setInterval(check, 100);
    events.forEach(name => video.addEventListener(name, check));
    video.addEventListener('loadedmetadata', play);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) { abort(); return; }
    if (supportsFrameCallback) frameId = video.requestVideoFrameCallback(() => { frameArrived = true; check(); });
    play();
  });
}

/** Read an image locally; never upload the QR photo or put its code in a URL. */
export async function decodeQrPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Не удалось открыть снимок. Сделайте фото QR ещё раз.'));
      image.src = url;
    });
    const code = decodeQrImage(image, image.naturalWidth, image.naturalHeight, document.createElement('canvas'));
    if (!code) throw new Error('QR-код не найден на снимке. Увеличьте его на компьютере и снимите целиком.');
    return code;
  } finally { URL.revokeObjectURL(url); }
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
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = stream;
    await waitForCameraPreview(video, signal);
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
