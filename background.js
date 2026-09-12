// Service worker — opens the side panel when the toolbar icon is clicked.
// The side panel itself holds all the UI and API logic.

// Enable the side panel for every window by default so the user can also
// open it from Chrome's side-panel menu.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    // Some Chrome versions expose this slightly differently; ignore failure.
    console.warn("setPanelBehavior failed:", err);
  }
});

// Fallback: clicking the action also explicitly opens the panel (required on
// Chrome versions where openPanelOnActionClick is not supported).
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.warn("sidePanel.open failed:", err);
  }
});
