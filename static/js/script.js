document.addEventListener('DOMContentLoaded', () => {
    // --- Get DOM Elements ---
    const imageInput = document.getElementById('imageInput');
    const languageSelect = document.getElementById('languageSelect');
    const analyzeButton = document.getElementById('analyzeButton');
    const imagePreview = document.getElementById('imagePreview');
    const previewArea = document.getElementById('previewArea');
    const extractedTextElem = document.getElementById('extractedText');
    const translatedTextElem = document.getElementById('translatedText');
    const translationLabelElem = document.getElementById('translationLabel');
    const resultsArea = document.getElementById('resultsArea'); // Text results area
    const loadingElem = document.getElementById('loading');
    const errorArea = document.getElementById('errorArea');
    const errorMessageElem = document.getElementById('errorMessage');
    const fileLabel = document.querySelector('.file-label'); // File input label

    // Camera related elements
    const startCameraButton = document.getElementById('startCameraButton');
    const cameraArea = document.getElementById('cameraArea');
    const videoElement = document.getElementById('videoElement');
    const snapButton = document.getElementById('snapButton');
    const cancelCameraButton = document.getElementById('cancelCameraButton');
    const canvasElement = document.getElementById('canvasElement'); // Hidden canvas
    const inputOptions = document.querySelector('.input-options'); // Div containing upload/take pic

    // New Feature Elements
    const copyButtons = document.querySelectorAll('.copy-button');
    const speakButton = document.getElementById('speakButton');
    const identifyObjectsButton = document.getElementById('identifyObjectsButton'); // New button
    const objectsArea = document.getElementById('objectsArea');           // New results area
    const identifiedObjectsText = document.getElementById('identifiedObjectsText'); // New results text element
    const loadingText = document.getElementById('loadingText');           // Loading text element

    // --- State Variables ---
    let currentFile = null;
    let currentStream = null; // To hold the MediaStream object
    let currentTranslationLanguage = null; // Store the language code of the last translation (e.g., 'spanish')

    // --- Language Mapping for TTS ---
    const languageCodeMap = {
        'english': 'en-US', 'spanish': 'es-ES', 'french': 'fr-FR',
        'german': 'de-DE', 'turkish': 'tr-TR', 'italian': 'it-IT',
        'portuguese': 'pt-PT', 'japanese': 'ja-JP', 'russian': 'ru-RU'
    };

    // --- Event Listeners ---
    imageInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files && files[0]) handleFileSelect(files[0]);
        else if (!currentFile) resetState();
    });
    startCameraButton.addEventListener('click', startCamera);
    snapButton.addEventListener('click', takeSnapshot);
    cancelCameraButton.addEventListener('click', stopCameraStream);
    analyzeButton.addEventListener('click', analyzeImage);
    identifyObjectsButton.addEventListener('click', identifyObjects); // Added listener
    copyButtons.forEach(button => button.addEventListener('click', handleCopyClick));
    speakButton.addEventListener('click', handleSpeakClick);

    // --- Core Functions ---

    function handleFileSelect(file) {
        stopCameraStream(); // Ensure camera is off
        currentFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            previewArea.style.display = 'block';
            resultsArea.style.display = 'none';
            objectsArea.style.display = 'none'; // Hide object results
            errorArea.style.display = 'none';
            cameraArea.style.display = 'none';
            inputOptions.style.display = 'flex';
            enableActionButtons(true); // Enable Analyze & Identify
            speakButton.style.display = 'none';
        }
        reader.readAsDataURL(currentFile);
    }

    async function startCamera() {
        previewArea.style.display = 'none';
        resultsArea.style.display = 'none';
        objectsArea.style.display = 'none';
        errorArea.style.display = 'none';
        currentFile = null;
        enableActionButtons(false); // Disable Analyze & Identify
        speakButton.style.display = 'none';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                currentStream = stream;
                videoElement.srcObject = stream;
                videoElement.onloadedmetadata = () => { videoElement.play(); };
                cameraArea.style.display = 'flex';
                inputOptions.style.display = 'none';
            } catch (err) {
                console.error("Error accessing camera:", err);
                let userMessage = `Could not access the camera. Error: ${err.name}. Please ensure permission is granted and no other app is using it.`;
                showError(userMessage);
                stopCameraStream(); // Clean up UI
            }
        } else {
            showError("Camera access is not supported by your browser.");
            stopCameraStream();
        }
    }

    function takeSnapshot() {
        if (!currentStream || !videoElement.videoWidth) return;

        const context = canvasElement.getContext('2d');
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        canvasElement.toBlob(async (blob) => {
             if (blob) {
                const fileName = `snapshot-${Date.now()}.jpg`;
                currentFile = new File([blob], fileName, { type: 'image/jpeg' });
                if (imagePreview.src.startsWith('blob:')) URL.revokeObjectURL(imagePreview.src);
                imagePreview.src = URL.createObjectURL(currentFile);
                previewArea.style.display = 'block';
                enableActionButtons(true); // Enable Analyze & Identify
                speakButton.style.display = 'none';
                objectsArea.style.display = 'none';
                stopCameraStream();
             } else {
                showError("Failed to capture snapshot.");
                stopCameraStream();
             }
        }, 'image/jpeg', 0.9);
    }

    function stopCameraStream() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        videoElement.srcObject = null;
        videoElement.onloadedmetadata = null;
        cameraArea.style.display = 'none';
        inputOptions.style.display = 'flex';
        // Don't re-enable buttons here automatically, depends on whether file exists
        enableActionButtons(!!currentFile); // Enable only if a file is loaded
    }

    async function analyzeImage() { // Text analysis and translation
        if (!currentFile) { showError("Please select or capture an image first."); return; }

        const selectedLanguage = languageSelect.value;
        const formData = new FormData();
        formData.append('image', currentFile, currentFile.name);
        formData.append('language', selectedLanguage);

        setLoadingState(true, 'Analyzing Text...');
        resultsArea.style.display = 'none'; // Explicitly hide text results
        objectsArea.style.display = 'none'; // Hide object results too

        try {
            const response = await fetch('/analyze', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Server error ${response.status}`);

            extractedTextElem.textContent = result.extracted_text || 'No text content received.';
            translatedTextElem.textContent = result.translated_text || 'No translation received.';
            translationLabelElem.innerHTML = `<i class="fa-solid fa-language"></i> Translated Text (${capitalizeFirstLetter(result.target_language || 'Unknown')}):`;
            resultsArea.style.display = 'block'; // Show text results area
            currentTranslationLanguage = result.target_language;

            // Show speak button logic
            speakButton.style.display = (result.translated_text && result.translated_text !== "No text to translate." && !result.translated_text.startsWith("Error:")) ? 'inline-flex' : 'none';

        } catch (error) {
            console.error("Error during text analysis:", error);
            showError(`Text analysis failed: ${error.message}`);
            currentTranslationLanguage = null;
            speakButton.style.display = 'none';
        } finally {
            setLoadingState(false);
        }
    }

    async function identifyObjects() { // Object identification
        if (!currentFile) { showError("Please select or capture an image first."); return; }

        const formData = new FormData();
        formData.append('image', currentFile, currentFile.name);

        setLoadingState(true, 'Identifying Objects...');
        objectsArea.style.display = 'none'; // Hide object results
        resultsArea.style.display = 'none'; // Hide text results too

        try {
            const response = await fetch('/identify', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Server error ${response.status}`);

            identifiedObjectsText.textContent = result.identified_objects || 'No objects identified or described.';
            objectsArea.style.display = 'block'; // Show object results area

        } catch (error) {
            console.error("Error during object identification:", error);
            showError(`Object identification failed: ${error.message}`);
        } finally {
            setLoadingState(false);
        }
    }

    // --- UI State Helper ---
    function setLoadingState(isLoading, message = 'Processing...') {
        loadingText.textContent = message;
        loadingElem.style.display = isLoading ? 'block' : 'none';
        enableActionButtons(!isLoading && !!currentFile); // Enable if not loading AND file exists
        startCameraButton.disabled = isLoading;
        imageInput.disabled = isLoading;
        if (fileLabel) fileLabel.style.pointerEvents = isLoading ? 'none' : 'auto';
        speakButton.style.display = 'none'; // Always hide speak button during loading
        if (isLoading) { // Hide results when loading starts
             resultsArea.style.display = 'none';
             objectsArea.style.display = 'none';
             errorArea.style.display = 'none';
        }
    }

     function enableActionButtons(enabled) {
        analyzeButton.disabled = !enabled;
        identifyObjectsButton.disabled = !enabled;
     }


    // --- Feature Handlers ---
    function handleCopyClick(event) {
        const button = event.currentTarget;
        const targetId = button.dataset.target;
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            const textToCopy = targetElement.textContent;
            if (!textToCopy || textToCopy.trim() === '') return;

            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalHTML = button.innerHTML;
                button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                button.disabled = true;
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                    button.disabled = false;
                }, 1500);
            }).catch(err => {
                console.error("Clipboard copy failed:", err);
                showError("Could not copy text. Please try manually.");
            });
        }
    }

    function handleSpeakClick() {
         if (!('speechSynthesis' in window)) {
            showError("Sorry, Text-to-Speech is not supported by this browser.");
            return;
        }
        const textToSpeak = translatedTextElem.textContent;
        if (!textToSpeak || !currentTranslationLanguage) return;

        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const langCode = languageCodeMap[currentTranslationLanguage.toLowerCase()];
        if (langCode) utterance.lang = langCode;
        else console.warn(`No TTS language code for: ${currentTranslationLanguage}`);

        utterance.onerror = (event) => { console.error("SpeechSynthesis Error", event); showError(`Speech error: ${event.error}`); speakButton.disabled = false;};
        utterance.onend = () => { speakButton.disabled = false; };
        utterance.onstart = () => { speakButton.disabled = true; };

        window.speechSynthesis.speak(utterance);
    }

    // --- Helper Functions ---
    function showError(message) {
        errorMessageElem.textContent = message;
        errorArea.style.display = 'block';
        resultsArea.style.display = 'none';
        objectsArea.style.display = 'none'; // Hide object area on error
        loadingElem.style.display = 'none';
        speakButton.style.display = 'none';
        // Ensure buttons are re-enabled based on file state after error
        enableActionButtons(!!currentFile);
        startCameraButton.disabled = false;
        imageInput.disabled = false;
        if (fileLabel) fileLabel.style.pointerEvents = 'auto';
    }

    function resetState() {
        stopCameraStream(); // Stops camera and resets relevant UI
        if (imagePreview.src.startsWith('blob:')) URL.revokeObjectURL(imagePreview.src);
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) window.speechSynthesis.cancel();

        currentFile = null;
        imageInput.value = '';
        imagePreview.src = '#';
        previewArea.style.display = 'none';
        resultsArea.style.display = 'none';
        objectsArea.style.display = 'none';   // Hide object area
        errorArea.style.display = 'none';
        identifiedObjectsText.textContent = ''; // Clear object text
        loadingText.textContent = 'Processing...'; // Reset loading text
        speakButton.style.display = 'none';
        currentTranslationLanguage = null;
        enableActionButtons(false); // Disable Analyze & Identify initially

        // Reset copy buttons
        copyButtons.forEach(button => {
            const icon = button.querySelector('i.fa-check');
            if(icon){
                 button.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                 button.disabled = false;
            }
        });
    }

    function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // --- Initial State ---
     resetState(); // Call reset state initially

}); // End DOMContentLoaded
