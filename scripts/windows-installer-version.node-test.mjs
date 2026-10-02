import assert from "node:assert/strict";
// Run explicitly with Node's test runner, independently of the Vitest UI suite.
import test from "node:test";
import { toMsiVersion } from "./windows-installer-version.mjs";

test("prerelease and build metadata stay out of numeric MSI ProductVersion", () => {
  for (const version of ["0.2.0-alpha.1", "0.2.0-beta.2", "0.2.0-rc.3+build.4", "0.2.0+build.4", "0.2.0"]) {
    assert.equal(toMsiVersion(version), "0.2.0");
  }
});

test("MSI numeric fields enforce Windows Installer limits", () => {
  assert.equal(toMsiVersion("255.255.65535"), "255.255.65535");
  for (const version of ["256.0.0", "0.256.0", "0.0.65536", "99999999999999999999.0.0"]) {
    assert.throws(() => toMsiVersion(version), /exceeds MSI limits/);
  }
});

test("malformed core versions fail instead of generating an installer version", () => {
  for (const version of ["0.2", "0.2.0.1", "v0.2.0", "01.2.0", "0.a.0", ""]) {
    assert.throws(() => toMsiVersion(version), /Invalid MSI version source/);
  }
});
