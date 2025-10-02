const DEFAULT_SETTINGS = {
    theme: 'dark',
    fontSize: 16
};

let themeInputs: NodeListOf<HTMLInputElement>;
let fontSizeSlider: HTMLInputElement;
let fontSizeValue: HTMLElement;
let resetBtn: HTMLButtonElement;

// Initialize the popup
document.addEventListener('DOMContentLoaded', init);

function init() {
    // Get DOM elements
    themeInputs = document.querySelectorAll('input[name="theme"]');
    fontSizeSlider = document.getElementById('fontSize') as HTMLInputElement;
    fontSizeValue = document.getElementById('fontSizeValue') as HTMLElement;
    resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;

    loadSettings();

    // Add event listeners
    themeInputs.forEach(input => {
        input.addEventListener('change', onThemeChange);
    });
    fontSizeSlider.addEventListener('input', onFontSizeChange);
    fontSizeSlider.addEventListener('change', saveSettings);
    resetBtn.addEventListener('click', resetToDefaults);

    console.log('[JSON Formtr Popup] Initialized');
}

function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        // Set theme
        const themeInput = document.querySelector(`input[name="theme"][value="${settings.theme}"]`) as HTMLInputElement;
        if (themeInput) {
            themeInput.checked = true;
        }

        // Set font size
        fontSizeSlider.value = settings.fontSize.toString();
        updateFontSizeDisplay(settings.fontSize);

        console.log('[JSON Formtr Popup] Settings loaded:', settings);
    });
}

function saveSettings() {
    const checkedTheme = document.querySelector('input[name="theme"]:checked') as HTMLInputElement;
    const settings = {
        theme: checkedTheme?.value || DEFAULT_SETTINGS.theme,
        fontSize: parseInt(fontSizeSlider.value, 10)
    };

    chrome.storage.sync.set(settings, () => {
        console.log('[JSON Formtr Popup] Settings saved:', settings);
    });
}

function onThemeChange() {
    saveSettings();
}

function onFontSizeChange() {
    const fontSize = parseInt(fontSizeSlider.value, 10);
    updateFontSizeDisplay(fontSize);
}

function updateFontSizeDisplay(fontSize: number) {
    fontSizeValue.textContent = `${fontSize}px`;
}

function resetToDefaults() {
    // Set default theme
    const defaultThemeInput = document.querySelector(`input[name="theme"][value="${DEFAULT_SETTINGS.theme}"]`) as HTMLInputElement;
    if (defaultThemeInput) {
        defaultThemeInput.checked = true;
    }

    // Set default font size
    fontSizeSlider.value = DEFAULT_SETTINGS.fontSize.toString();
    updateFontSizeDisplay(DEFAULT_SETTINGS.fontSize);

    // Save defaults
    chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
        console.log('[JSON Formtr Popup] Settings reset to defaults');
    });
}
