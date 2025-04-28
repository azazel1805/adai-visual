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
    const analyzeCorrectButton = document.getElementById('analyzeCorrectButton'); // New button
    const correctionArea = document.getElementById('correctionArea');       // New results area
    const correctedTextElem = document.getElementById('correctedText');       // New results text element

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
        else if (!currentFile) resetState(); // Reset only if nothing was selected/present
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
        stopCameraStream(); // Ensure camera is off
        currentFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            previewArea.style.display = 'block'; // Makes the container visible
            // ***** FIX HERE: Pass false to keep preview visible *****
            hideResultAreas(false);
            // ***** END FIX *****
            cameraArea.style.display = 'none';
            inputOptions.style.display = 'flex';
            enableActionButtons(true); // Enable Analyze & Identify
            speakButton.style.display = 'none';
            analyzeCorrectButton.style.display = 'none';
        }
        reader.readAsDataURL(currentFile);
    }

    async function startCamera() {
        hideResultAreas(); // Hide all results including preview
        errorArea.style.display = 'none';
        currentFile = null;
        enableActionButtons(false); // Disable Analyze & Identify
        speakButton.style.display = 'none';
        analyzeCorrectButton.style.display = 'none';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                currentStream = stream;
                videoElement.srcObject = stream;
                videoElement.onloadedmetadata = () => { videoElement.play(); };
                cameraArea.style.display = 'block'; // Show camera card
                inputOptions.style.display = 'none';
            } catch (err) {
                console.error("Error accessing camera:", err);
                let userMessage = `Could not access the camera. Error: ${err.name}. Ensure permission is granted and no other app is using it.`;
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
                previewArea.style.display = 'block'; // Makes the container visible
                enableActionButtons(true); // Enable Analyze & Identify
                // ***** FIX HERE: Pass false to keep preview visible *****
                hideResultAreas(false);
                // ***** END FIX *****
                speakButton.style.display = 'none';
                analyzeCorrectButton.style.display = 'none';
                stopCameraStream(); // Stops stream and hides camera view
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
        // Enable actions only if a file/snapshot is currently loaded
        enableActionButtons(!!currentFile);
    }

    async function analyzeImage() { // Text analysis and translation
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
            resultsArea.style.display = 'block'; // Show text results section
            currentTranslationLanguage = result.target_language;

            // Enable Correction Button only if extraction was successful
            const hasExtractedText = result.extracted_text && result.extracted_text !== "No text found." && !result.extracted_text.startsWith("Error:");
            updateCorrectionButtonState(hasExtractedText);

            // Show speak button logic
            speakButton.style.display = (result.translated_text && result.translated_text !== "No text to translate." && !result.translated_text.startsWith("Error:")) ? 'inline-flex' : 'none';

        } catch (error) {
            console.error("Error during text analysis:", error);
            showError(`Text analysis failed: ${error.message}`);
            currentTranslationLanguage = null;
            updateCorrectionButtonState(false); // Ensure correct button is hidden/disabled
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
        hideResultAreas(false); // Keep preview visible, hide result sections

        try {
            const response = await fetch('/identify', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Server error ${response.status}`);

            identifiedObjectsText.textContent = result.identified_objects || 'No objects identified or described.';
            objectsArea.style.display = 'block'; // Show object results area
            // Ensure other results remain hidden if this was the only action
            resultsArea.style.display = 'none';
            correctionArea.style.display = 'none';
            analyzeCorrectButton.style.display = 'none';
            speakButton.style.display = 'none';


        } catch (error) {
            console.error("Error during object identification:", error);
            showError(`Object identification failed: ${error.message}`);
        } finally {
            setLoadingState(false);
        }
    }

    async function analyzeAndCorrectText() { // Correct extracted text
        const textToCorrect = extractedTextElem.textContent;
        if (!textToCorrect || textToCorrect === "No text found." || textToCorrect.startsWith("Error:")) {
            showError("No valid extracted text available to analyze.");
            return;
        }

        // Disable button immediately to prevent double clicks
        analyzeCorrectButton.disabled = true;
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
            // Ensure main text area is still visible if it was before
            if(extractedTextElem.textContent) resultsArea.style.display = 'block';

        } catch (error) {
            console.error("Error during text correction:", error);
            showError(`Text correction failed: ${error.message}`);
            correctionArea.style.display = 'none'; // Hide on error
        } finally {
            setLoadingState(false); // This will re-enable buttons based on file state
            // Re-evaluate final state of correction button (might still be valid text)
            updateCorrectionButtonState(!!extractedTextElem.textContent && extractedTextElem.textContent !== "No text found." && !extractedTextElem.textContent.startsWith("Error:"));
        }
    }
    async function estimateAge() {
        if (!currentFile) { showError("Please select or capture an image first."); return; }

        const formData = new FormData();
        formData.append('image', currentFile, currentFile.name);

        setLoadingState(true, 'Estimating Age...');
        hideResultAreas(false); // Keep preview visible, hide results

        try {
            const response = await fetch('/estimate_age', { // Call the NEW endpoint
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Server error ${response.status}`);

            // Display the age estimate
            ageEstimateText.textContent = result.estimated_age || 'Could not estimate age.';
            ageEstimateArea.style.display = 'block'; // Show age estimate area

        } catch (error) {
            console.error("Error during age estimation:", error);
            showError(`Age estimation failed: ${error.message}`);
        } finally {
            setLoadingState(false);
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

        // Hide buttons that depend on results during loading
        speakButton.style.display = 'none';
        if(isLoading) {
            analyzeCorrectButton.style.display = 'none';
            errorArea.style.display = 'none'; // Hide error when loading starts
             // Don't hide preview here, handled by calling functions
        }

        if (!isLoading) {
            // After loading, re-enable main action buttons based on file state
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
        // Enables/disables and shows/hides the Correct Text button
        analyzeCorrectButton.disabled = !enabled;
        analyzeCorrectButton.style.display = enabled ? 'inline-flex' : 'none';
    }

    function hideResultAreas(hidePreview = true) {
         // Hides all result sections, conditionally hiding preview
         if(hidePreview) previewArea.style.display = 'none';
         resultsArea.style.display = 'none';
         objectsArea.style.display = 'none';
         correctionArea.style.display = 'none';
         // Also hide buttons related to these areas
         speakButton.style.display = 'none';
         analyzeCorrectButton.style.display = 'none';
    }

    // --- Feature Handlers ---
    function handleCopyClick(event) {
        const button = event.currentTarget;
        const targetId = button.dataset.target;
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            const textToCopy = targetElement.textContent?.trim();
            if (!textToCopy) return;

            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalHTML = button.innerHTML;
                button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                button.disabled = true;
                button.classList.add('copied-feedback');
                setTimeout(() => {
                    // Restore only if the button hasn't been disabled by other means
                    if (button.classList.contains('copied-feedback')) {
                         button.innerHTML = originalHTML;
                         button.disabled = false;
                         button.classList.remove('copied-feedback');
                    }
                }, 1800);
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
        errorArea.style.display = 'block'; // Show error card
        // Hide results/objects/corrections, but keep preview if visible
        hideResultAreas(false);
        // Ensure loading indicator is off and buttons reset correctly
        setLoadingState(false);
        // Specifically hide speak/correct buttons on error
        speakButton.style.display = 'none';
        analyzeCorrectButton.style.display = 'none';
    }

    function resetState() {
        stopCameraStream(); // Stops camera and resets relevant UI
        if (imagePreview.src.startsWith('blob:')) URL.revokeObjectURL(imagePreview.src);
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) window.speechSynthesis.cancel();

        currentFile = null;
        imageInput.value = '';
        imagePreview.src = '#';
        hideResultAreas(true); // Hide all results including preview
        errorArea.style.display = 'none';
        extractedTextElem.textContent = ''; // Clear text from elements too
        translatedTextElem.textContent = '';
        identifiedObjectsText.textContent = '';
        correctedTextElem.textContent = '';
        loadingText.textContent = 'Processing...';
        currentTranslationLanguage = null;
        enableActionButtons(false); // Disable main actions
        updateCorrectionButtonState(false); // Ensure correction button is hidden/disabled

        // Reset copy buttons visual state
        copyButtons.forEach(button => {
            // More robust check in case innerHTML was modified differently
            if(button.disabled || button.classList.contains('copied-feedback')){
                 // Assume original icon was copy if resetting
                 const originalIconHTML = '<i class="fa-regular fa-copy"></i> Copy'; // Reconstruct original state
                 button.innerHTML = originalIconHTML;
                 button.disabled = false;
                 button.classList.remove('copied-feedback');
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
