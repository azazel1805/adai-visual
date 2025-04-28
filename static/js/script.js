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
    const fileLabel = document.querySelector('.file-label');

    // Camera related elements
    const startCameraButton = document.getElementById('startCameraButton');
    const cameraArea = document.getElementById('cameraArea');
    const videoElement = document.getElementById('videoElement');
    const snapButton = document.getElementById('snapButton');
    const cancelCameraButton = document.getElementById('cancelCameraButton');
    const canvasElement = document.getElementById('canvasElement');
    const inputOptions = document.querySelector('.input-options');

    // New Feature Elements
    const copyButtons = document.querySelectorAll('.copy-button');
    const speakButton = document.getElementById('speakButton');
    const identifyObjectsButton = document.getElementById('identifyObjectsButton');
    const objectsArea = document.getElementById('objectsArea');
    const identifiedObjectsText = document.getElementById('identifiedObjectsText');
    const loadingText = document.getElementById('loadingText');
    const analyzeCorrectButton = document.getElementById('analyzeCorrectButton');
    const correctionArea = document.getElementById('correctionArea');
    const correctedTextElem = document.getElementById('correctedText');

    // --- State Variables ---
    let currentFile = null;
    let currentStream = null;
    let currentTranslationLanguage = null;

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
    identifyObjectsButton.addEventListener('click', identifyObjects);
    analyzeCorrectButton.addEventListener('click', analyzeAndCorrectText);
    copyButtons.forEach(button => button.addEventListener('click', handleCopyClick));
    speakButton.addEventListener('click', handleSpeakClick);

    // --- Core Functions ---

    function handleFileSelect(file) {
        stopCameraStream();
        currentFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            previewArea.style.display = 'block';
            hideResultAreas();
            cameraArea.style.display = 'none';
            inputOptions.style.display = 'flex';
            enableActionButtons(true);
        }
        reader.readAsDataURL(currentFile);
    }

    async function startCamera() {
        hideResultAreas();
        errorArea.style.display = 'none';
        currentFile = null;
        enableActionButtons(false);
        speakButton.style.display = 'none';
        analyzeCorrectButton.style.display = 'none';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                currentStream = stream;
                videoElement.srcObject = stream;
                videoElement.onloadedmetadata = () => { videoElement.play(); };
                cameraArea.style.display = 'block'; // Show as block now due to card style
                inputOptions.style.display = 'none';
            } catch (err) {
                console.error("Error accessing camera:", err);
                let userMessage = `Could not access the camera. Error: ${err.name}. Ensure permission is granted and no other app is using it.`;
                showError(userMessage);
                stopCameraStream();
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
                previewArea.style.display = 'block'; // Show as block due to card style
                enableActionButtons(true);
                hideResultAreas(); // Hide results after taking new snap
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
        enableActionButtons(!!currentFile); // Enable actions only if file exists
    }

    async function analyzeImage() {
        if (!currentFile) { showError("Please select or capture an image first."); return; }

        const selectedLanguage = languageSelect.value;
        const formData = new FormData();
        formData.append('image', currentFile, currentFile.name);
        formData.append('language', selectedLanguage);

        setLoadingState(true, 'Analyzing Text & Translating...');
        hideResultAreas(false); // Keep preview visible, hide others

        try {
            const response = await fetch('/analyze', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Server error ${response.status}`);

            extractedTextElem.textContent = result.extracted_text || 'No text content received.';
            translatedTextElem.textContent = result.translated_text || 'No translation received.';
            translationLabelElem.innerHTML = `<i class="fa-solid fa-language"></i> Translated Text (${capitalizeFirstLetter(result.target_language || 'Unknown')}):`;
            resultsArea.style.display = 'block'; // Show this section
            currentTranslationLanguage = result.target_language;

            const hasExtractedText = result.extracted_text && result.extracted_text !== "No text found." && !result.extracted_text.startsWith("Error:");
            updateCorrectionButtonState(hasExtractedText);

            speakButton.style.display = (result.translated_text && result.translated_text !== "No text to translate." && !result.translated_text.startsWith("Error:")) ? 'inline-flex' : 'none';

        } catch (error) {
            console.error("Error during text analysis:", error);
            showError(`Text analysis failed: ${error.message}`);
            currentTranslationLanguage = null;
            updateCorrectionButtonState(false);
            speakButton.style.display = 'none';
        } finally {
            setLoadingState(false);
        }
    }

    async function identifyObjects() {
        if (!currentFile) { showError("Please select or capture an image first."); return; }

        const formData = new FormData();
        formData.append('image', currentFile, currentFile.name);

        setLoadingState(true, 'Identifying Objects...');
        hideResultAreas(false); // Keep preview visible

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

    async function analyzeAndCorrectText() {
        const textToCorrect = extractedTextElem.textContent;
        if (!textToCorrect || textToCorrect === "No text found." || textToCorrect.startsWith("Error:")) {
            showError("No valid extracted text available to analyze.");
            return;
        }

        setLoadingState(true, 'Analyzing for corrections...');
        correctionArea.style.display = 'none'; // Hide previous corrections

        try {
            const response = await fetch('/correct_text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToCorrect }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Server error ${response.status}`);

            correctedTextElem.textContent = result.corrected_text || 'No correction suggestions provided.';
            correctionArea.style.display = 'block'; // Show correction area
            resultsArea.style.display = 'block'; // Ensure text analysis area is visible

        } catch (error) {
            console.error("Error during text correction:", error);
            showError(`Text correction failed: ${error.message}`);
        } finally {
            setLoadingState(false);
            // Re-check if correction button should be enabled
            updateCorrectionButtonState(!!extractedTextElem.textContent && extractedTextElem.textContent !== "No text found." && !extractedTextElem.textContent.startsWith("Error:"));
        }
    }

    // --- UI State Helpers ---
    function setLoadingState(isLoading, message = 'Processing...') {
        loadingText.textContent = message;
        loadingElem.style.display = isLoading ? 'block' : 'none';

        // Disable all interactive elements during loading
        const elementsToDisable = [analyzeButton, identifyObjectsButton, analyzeCorrectButton, startCameraButton, imageInput, fileLabel, languageSelect];
        elementsToDisable.forEach(el => { if(el) el.disabled = isLoading; });
        if (fileLabel) fileLabel.style.pointerEvents = isLoading ? 'none' : 'auto';

        // Hide buttons that depend on results
        speakButton.style.display = 'none';
        if(isLoading) {
            analyzeCorrectButton.style.display = 'none';
            errorArea.style.display = 'none'; // Hide error when loading starts
        }

        if (!isLoading) {
            // After loading, re-enable buttons based on file state
            enableActionButtons(!!currentFile);
             // Re-evaluate correction button state after loading finishes
            updateCorrectionButtonState(!!extractedTextElem.textContent && extractedTextElem.textContent !== "No text found." && !extractedTextElem.textContent.startsWith("Error:"));
        }
    }

    function enableActionButtons(enabled) { // Enables Identify and Analyze/Translate
        analyzeButton.disabled = !enabled;
        identifyObjectsButton.disabled = !enabled;
    }

    function updateCorrectionButtonState(enabled) {
        analyzeCorrectButton.disabled = !enabled;
        analyzeCorrectButton.style.display = enabled ? 'inline-flex' : 'none';
    }

    function hideResultAreas(hidePreview = true) {
         if(hidePreview) previewArea.style.display = 'none';
         resultsArea.style.display = 'none';
         objectsArea.style.display = 'none';
         correctionArea.style.display = 'none';
         speakButton.style.display = 'none';
         analyzeCorrectButton.style.display = 'none';
    }

    // --- Feature Handlers ---
    function handleCopyClick(event) {
        const button = event.currentTarget;
        const targetId = button.dataset.target;
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            const textToCopy = targetElement.textContent?.trim(); // Use optional chaining and trim
            if (!textToCopy) return;

            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalHTML = button.innerHTML;
                button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                button.disabled = true;
                // Add a class for feedback styling
                button.classList.add('copied-feedback');
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                    button.disabled = false;
                    button.classList.remove('copied-feedback');
                }, 1800); // Slightly longer feedback
            }).catch(err => {
                console.error("Clipboard copy failed:", err);
                showError("Could not copy text. Please try manually.");
            });
        }
    }

    function handleSpeakClick() {
        if (!('speechSynthesis' in window)) {
            showError("Sorry, Text-to-Speech is not supported by this browser."); return;
        }
        const textToSpeak = translatedTextElem.textContent?.trim();
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
        errorArea.style.display = 'block'; // Show as block due to card
        hideResultAreas(false); // Hide results but keep preview if shown
        setLoadingState(false); // Ensure loading indicator is off and buttons reset correctly
    }

    function resetState() {
        stopCameraStream();
        if (imagePreview.src.startsWith('blob:')) URL.revokeObjectURL(imagePreview.src);
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) window.speechSynthesis.cancel();

        currentFile = null;
        imageInput.value = '';
        imagePreview.src = '#';
        hideResultAreas(true); // Hide all results including preview
        errorArea.style.display = 'none';
        identifiedObjectsText.textContent = '';
        correctedTextElem.textContent = '';
        loadingText.textContent = 'Processing...';
        currentTranslationLanguage = null;
        enableActionButtons(false); // Disable main actions
        updateCorrectionButtonState(false); // Disable correction button

        // Reset copy buttons visual state
        copyButtons.forEach(button => {
            if(button.classList.contains('copied-feedback')){
                 button.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; // Adjust if icon changed
                 button.disabled = false;
                 button.classList.remove('copied-feedback');
            } else if (button.disabled && button.querySelector('i.fa-check')) {
                 // Fallback if class wasn't added but it shows copied
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
     resetState();

}); // End DOMContentLoaded
