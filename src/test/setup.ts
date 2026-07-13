// Test setup: shim FileReader for Node so exif-geotag.ts (which uses
// FileReader.readAsDataURL) runs under vitest without a browser environment.

if (typeof (globalThis as { FileReader?: unknown }).FileReader === "undefined") {
  class NodeFileReader {
    result: string | ArrayBuffer | null = null;
    error: unknown = null;
    onload: ((this: NodeFileReader, ev: unknown) => void) | null = null;
    onerror: ((this: NodeFileReader, ev: unknown) => void) | null = null;
    readAsDataURL(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          const b64 = Buffer.from(buf).toString("base64");
          const type = blob.type || "application/octet-stream";
          this.result = `data:${type};base64,${b64}`;
          this.onload?.call(this, {});
        })
        .catch((err) => {
          this.error = err;
          this.onerror?.call(this, {});
        });
    }
  }
  (globalThis as { FileReader: unknown }).FileReader = NodeFileReader;
}
