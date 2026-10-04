(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function detectPlatform(input) {
    const value = input || {};
    const ua = String(value.userAgent || "");
    const platform = String(value.platform || "");
    const touch = Number(value.maxTouchPoints || 0);
    const hints = value.hints || {};
    const hintedPlatform = String(hints.platform || "");

    if (/iPad/i.test(ua) || (/Mac/i.test(platform) && touch > 1)) {
      return { kind: "mobile", reason: "iPad and mobile devices are not supported." };
    }
    if (/Android|iPhone|iPod|Mobile/i.test(ua)) {
      return { kind: "mobile", reason: "Mobile devices are not supported." };
    }
    if (/Mac/i.test(hintedPlatform) || (/Mac/i.test(platform) && touch <= 1) || /Macintosh|Mac OS X/i.test(ua)) {
      return { kind: "mac", package: "mac", reason: "Recommended for this Mac." };
    }
    if (!(/Windows/i.test(hintedPlatform) || /Win/i.test(platform) || /Windows NT/i.test(ua))) {
      return { kind: "unknown", reason: "Choose the package for your computer." };
    }

    const legacyWindows = /Windows NT (?:5\.|6\.[0-3])/i.test(ua);
    const version = String(hints.platformVersion || "");
    const hasVersion = /^\d+(?:\.\d+){0,2}$/.test(version);
    const versionMajor = hasVersion ? Number(version.split(".")[0]) : null;
    if (legacyWindows || (versionMajor !== null && versionMajor < 10)) {
      return { kind: "unsupported", reason: "Windows 10 version 2004 or later is required." };
    }

    const arch = String(hints.architecture || "").toLowerCase();
    const bitness = String(hints.bitness || "");
    if (bitness === "32") {
      return { kind: "unsupported", reason: "32-bit Windows is not supported." };
    }
    if (arch === "arm" && bitness === "64") {
      return { kind: "windows-arm64", package: "win-arm64", reason: "Recommended for this Windows ARM64 device." };
    }
    if (arch === "x86" && bitness === "64") {
      return { kind: "windows-x64", package: "win-x64", reason: "Recommended for this Windows x64 device." };
    }
    return { kind: "windows-unknown", reason: "Choose Windows x64 or ARM64. The architecture could not be confirmed." };
  }

  function readEnvironment(nav) {
    return {
      userAgent: nav.userAgent,
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints,
      hints: {}
    };
  }

  function safeManifest(manifest, type) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
    if (type === "mac") {
      if (typeof manifest.source_revision !== "string" || !/^[a-f0-9]{7,64}$/i.test(manifest.source_revision)) return null;
      if (!/^[a-f0-9]{64}$/i.test(manifest.sha256 || "") || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 0) return null;
      return { source_revision: manifest.source_revision, sha256: manifest.sha256.toLowerCase(), bytes: manifest.bytes };
    }
    if (typeof manifest.version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/i.test(manifest.version)) return null;
    if (!/^[a-f0-9]{64}$/i.test(manifest.source_sha256 || "") || manifest.signed !== false || manifest.windows_runtime_verified !== false || !Array.isArray(manifest.packages)) return null;
    const expected = { "win-x64": "BuildersDoor-win-x64.zip", "win-arm64": "BuildersDoor-win-arm64.zip" };
    const packages = {};
    for (const item of manifest.packages) {
      if (!item || !Object.prototype.hasOwnProperty.call(expected, item.rid) || item.file !== expected[item.rid] || !/^[a-f0-9]{64}$/i.test(item.sha256 || "") || !Number.isSafeInteger(item.bytes) || item.bytes < 0) return null;
      packages[item.rid] = { file: item.file, sha256: item.sha256.toLowerCase(), bytes: item.bytes };
    }
    if (!packages["win-x64"] || !packages["win-arm64"]) return null;
    return { version: manifest.version, source_sha256: manifest.source_sha256.toLowerCase(), packages };
  }

  function start(root) {
    const doc = root.document;
    const links = Array.from(doc.querySelectorAll("[data-package]"));
    const details = doc.getElementById("release-details");
    if (!links.length) return;

    const nav = root.navigator || {};
    const env = readEnvironment(nav);
    let detected = detectPlatform(env);
    function update() {
      links.forEach((link) => {
        const recommended = link.dataset.package === detected.package;
        link.classList.toggle("recommended", recommended);
        link.closest(".download-card").classList.toggle("recommended", recommended);
      });
    }
    update();

    if (nav.userAgentData && typeof nav.userAgentData.getHighEntropyValues === "function") {
      nav.userAgentData.getHighEntropyValues(["architecture", "bitness", "platform", "platformVersion"]).then((values) => {
        env.hints = values;
        detected = detectPlatform(env);
        update();
      }).catch(() => {});
    }

    Promise.all([
      root.fetch("release.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      root.fetch("windows-release.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null)
    ]).then(([macRaw, winRaw]) => {
      const mac = safeManifest(macRaw, "mac");
      const win = safeManifest(winRaw, "windows");
      if (!mac && !win) return;
      const lines = [];
      if (mac) lines.push("Mac build " + mac.source_revision.slice(0, 12) + " · SHA-256 " + mac.sha256 + " · " + mac.bytes + " bytes");
      if (win) {
        lines.push("Windows version " + win.version + " · unsigned test builds · Windows runtime not verified");
        lines.push("Windows source SHA-256 " + win.source_sha256);
        lines.push("x64 SHA-256 " + win.packages["win-x64"].sha256 + " · " + win.packages["win-x64"].bytes + " bytes");
        lines.push("ARM64 SHA-256 " + win.packages["win-arm64"].sha256 + " · " + win.packages["win-arm64"].bytes + " bytes");
      }
      details.textContent = lines.join("\n");
    });
  }

  return { detectPlatform, safeManifest, start };
});
