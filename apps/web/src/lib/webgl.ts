/** Can this browser draw the 3D scene? Checked before downloading the scene chunk. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // free the test context at once
    return !!gl;
  } catch {
    return false;
  }
}
