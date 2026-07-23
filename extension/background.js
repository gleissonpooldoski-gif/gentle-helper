// Minimal service worker for MV3.
chrome.runtime.onInstalled.addListener(() => {
  console.log("[WA EXT] instalada");
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "wa:ping") {
    chrome.storage.local.get(["connected", "channel_id"], (r) => {
      sendResponse({ connected: Boolean(r.connected), channel_id: r.channel_id || null });
    });
    return true;
  }
});
