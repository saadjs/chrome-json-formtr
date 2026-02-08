// Handle keyboard commands
chrome.commands?.onCommand.addListener((command) => {
    if (command === "toggle-raw-formatted") {
        // Forward a message to content script to toggle
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (tabId)
                void chrome.tabs.sendMessage(tabId, {
                    type: "TOGGLE_JSON_VIEW",
                });
        });
    }
});

// Create context menu on installation
chrome.runtime.onInstalled?.addListener(() => {
    chrome.contextMenus?.create({
        id: "json-formtr-settings",
        title: "JSON Formtr Settings",
        contexts: ["all"],
    });
});

// Handle context menu clicks
chrome.contextMenus?.onClicked.addListener((info) => {
    if (info.menuItemId === "json-formtr-settings") {
        chrome.runtime.openOptionsPage();
    }
});
