import { Blob as NodeBlob } from "node:buffer";
import { URL as NodeURL } from "node:url";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
beforeEach(() => localStorage.clear());
afterEach(cleanup);

// jsdom has no image decoder. Read real PNG dimensions for GLTFLoader's bitmap
// objects; embedded pixels are checked by the asset validator and browser renders.
globalThis.Blob = NodeBlob as typeof Blob;
URL.createObjectURL = (source) => {
  if (!(source instanceof NodeBlob)) throw new Error("Expected a GLB image Blob");
  return NodeURL.createObjectURL(source);
};
URL.revokeObjectURL = NodeURL.revokeObjectURL;
globalThis.createImageBitmap = async (source: ImageBitmapSource) => {
  if (!(source instanceof NodeBlob)) throw new Error("Expected an embedded GLB image");
  const bytes = new Uint8Array(await source.arrayBuffer());
  if (Array.from(bytes.subarray(0, 8)).join() !== "137,80,78,71,13,10,26,10") throw new Error("Expected PNG texture");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), close() {} } as ImageBitmap;
};
