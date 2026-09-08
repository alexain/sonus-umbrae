export function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}${cleanPath}`;
}

export async function loadWasmWorklet(
  context: AudioContext,
  wasmPath: string,
  workletPath: string,
  errorMessage: string | ((response: Response) => string),
): Promise<ArrayBuffer> {
  const response = await fetch(publicAssetUrl(wasmPath));
  if (!response.ok) {
    throw new Error(typeof errorMessage === 'function' ? errorMessage(response) : errorMessage);
  }
  const wasmBytes = await response.arrayBuffer();
  await context.audioWorklet.addModule(publicAssetUrl(workletPath));
  return wasmBytes;
}

export async function loadWorkletModule(context: AudioContext, workletPath: string): Promise<void> {
  await context.audioWorklet.addModule(publicAssetUrl(workletPath));
}
