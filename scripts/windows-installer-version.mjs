// Windows Installer compares only three numeric ProductVersion fields.
// Keep the complete SemVer in application metadata and artifact names.
export function toMsiVersion(version) {
  const core = version.split(/[+-]/, 1)[0];
  const fields = core.split(".");
  if (fields.length !== 3 || fields.some((field) => !/^(0|[1-9]\d*)$/.test(field))) {
    throw new Error(`Invalid MSI version source: ${version}`);
  }
  const limits = [255, 255, 65535];
  if (fields.some((field, index) => Number(field) > limits[index])) {
    throw new Error(`Version ${version} exceeds MSI limits (255.255.65535).`);
  }
  return core;
}
