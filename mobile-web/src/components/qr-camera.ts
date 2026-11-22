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

type PlaybackAction = (resume: (() => void) | null) => void;

/** WebKit may decode video before it reports a frame to the compositor. */
export function waitForCameraPreview(
  video: HTMLVideoElement,
  signal: AbortSignal,
  timeoutMs = 8000,
  onPlaybackAction?: PlaybackAction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let complete = false, frameArrived = false, blocked = false;
    let frameId: number | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
    let playAttempt = 0;
    const initialTime = video.currentTime;
    const supportsFrameCallback = typeof video.requestVideoFrameCallback === 'function';
    const events = ['loadedmetadata', 'loadeddata', 'playing', 'resize'];
    const clean = () => {
      clearTimeout(timeout); clearInterval(poll);
      events.forEach(name => video.removeEventListener(name, check));
      video.removeEventListener('loadedmetadata', playWhenReady);
      signal.removeEventListener('abort', abort);
      if (frameId !== undefined) video.cancelVideoFrameCallback?.(frameId);
    };
    const finish = (error?: Error) => {
      if (complete) return;
      complete = true; clean();
      if (error) reject(error); else resolve();
    };
    const check = () => {
      const playingFrames = !supportsFrameCallback || frameArrived || video.currentTime > initialTime;
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused && playingFrames) {
        if (blocked) onPlaybackAction?.(null);
        finish();
      }
    };
    const armTimeout = () => {
      timeout = setTimeout(() => finish(new Error('CAMERA_PREVIEW_UNAVAILABLE')), timeoutMs);
    };
    const play = () => {
      if (complete) return;
      const attempt = ++playAttempt;
      void video.play().then(check).catch((error: unknown) => {
        if (complete || attempt !== playAttempt) return;
        if (error instanceof Error && error.name === 'NotAllowedError' && onPlaybackAction) {
          blocked = true;
          clearTimeout(timeout);
          onPlaybackAction(() => {
            if (complete || !blocked) return;
            blocked = false;
            onPlaybackAction(null);
            armTimeout();
            play();
          });
        }
        // Attaching or starting media can interrupt play(). Metadata and frame
        // events can still arrive, so let the preview watchdog decide.
      });
    };
    const playWhenReady = () => { if (!blocked && video.paused) play(); };
    const abort = () => finish(new DOMException('Camera closed', 'AbortError'));
    const poll = setInterval(check, 100);
    events.forEach(name => video.addEventListener(name, check));
    video.addEventListener('loadedmetadata', playWhenReady);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) { abort(); return; }
    armTimeout();
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

export async function startQrCamera(
  video: HTMLVideoElement,
  signal: AbortSignal,
  onCode: (code: string) => void,
  onReady: () => void,
  onPlaybackAction?: PlaybackAction,
) {
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    if (!stream) return;
    stream.getTracks().forEach(track => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
    stream = undefined;
  };
  const open = async (constraints: MediaTrackConstraints) => {
    stream = await navigator.mediaDevices.getUserMedia({video: constraints, audio: false});
    if (signal.aborted) { stop(); return; }
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = stream;
    await waitForCameraPreview(video, signal, 8000, onPlaybackAction);
  };
  const facingMode = {ideal: 'environment'};
  signal.addEventListener('abort', stop, {once: true});
  try {
    try {
      await open({facingMode, width: {ideal: 1920}, height: {ideal: 1080}});
    } catch (error) {
      if (signal.aborted || !(error instanceof Error) || error.message !== 'CAMERA_PREVIEW_UNAVAILABLE') throw error;
      stop();
      await open({facingMode});
    }
    if (signal.aborted) return;
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
