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
    const resultsArea = document.getElementById('resultsArea');
    const loadingElem = document.getElementById('loading');
    const errorArea = document.getElementById('errorArea');
    const errorMessageElem = document.getElementById('errorMessage');

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

    // --- State Variables ---
    let currentFile = null;
    let currentStream = null; // To hold the MediaStream object
    let currentTranslationLanguage = null; // Store the language code of the last translation (e.g., 'spanish')

    // --- Language Mapping for TTS ---
    // Maps our dropdown values to BCP 47 language codes for SpeechSynthesis
    const languageCodeMap = {
        'english': 'en-US',
        'spanish': 'es-ES',
        'french': 'fr-FR',
        'german': 'de-DE',
        'turkish': 'tr-TR',
        'italian': 'it-IT',
        'portuguese': 'pt-PT', // Or pt-BR
        'japanese': 'ja-JP',
        'russian': 'ru-RU'
        // Add more mappings if you add languages
    };

    // --- Event Listeners ---

    // 1. File Input Change
    imageInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files && files[0]) {
            handleFileSelect(files[0]);
        } else {
            if (!currentFile) {
                 resetState();
            }
        }
    });

    // 2. Start Camera Button Click
    startCameraButton.addEventListener('click', startCamera);

    // 3. Snap Photo Button Click
    snapButton.addEventListener('click', takeSnapshot);

    // 4. Cancel Camera Button Click
    cancelCameraButton.addEventListener('click', stopCameraStream);

    // 5. Analyze Button Click
    analyzeButton.addEventListener('click', analyzeImage);

    // 6. Copy Buttons Click (Event Delegation could be used, but this is simpler for few buttons)
    copyButtons.forEach(button => {
        button.addEventListener('click', handleCopyClick);
    });

    // 7. Speak Button Click
    speakButton.addEventListener('click', handleSpeakClick);


    // --- Core Functions ---

    function handleFileSelect(file) {
        stopCameraStream(); // Ensure camera is off if a file is chosen
        currentFile = file;
        const reader = new FileReader();

        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            previewArea.style.display = 'block';
            resultsArea.style.display = 'none'; // Hide old results
            errorArea.style.display = 'none';   // Hide old errors
            cameraArea.style.display = 'none'; // Hide camera
            inputOptions.style.display = 'flex'; // Ensure input options are visible
            analyzeButton.disabled = false; // Enable analyze button
            speakButton.style.display = 'none'; // Hide speak button
        }
        reader.readAsDataURL(currentFile);
    }

    async function startCamera() {
        // Don't reset everything, just hide preview/results/errors
        previewArea.style.display = 'none';
        resultsArea.style.display = 'none';
        errorArea.style.display = 'none';
        currentFile = null; // Clear any previously selected/snapped file
        analyzeButton.disabled = true; // Disable analyze button
        speakButton.style.display = 'none'; // Hide speak button

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                // Request video stream
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }, // Prefer back camera
                    audio: false
                });
                currentStream = stream; // Store stream
                videoElement.srcObject = stream;
                videoElement.onloadedmetadata = () => {
                   videoElement.play();
                };

                cameraArea.style.display = 'flex';
                inputOptions.style.display = 'none'; // Hide upload/take picture buttons

            } catch (err) {
                console.error("Error accessing camera:", err);
                let userMessage = "Could not access the camera. ";
                if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
                    userMessage += "No camera found on this device.";
                } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                    userMessage += "Permission denied. Please allow camera access in your browser settings.";
                } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
                     userMessage += "Camera might be already in use by another application.";
                } else {
                    userMessage += `Error: ${err.message}`;
                }
                 showError(userMessage);
                 stopCameraStream(); // Clean up UI
            }
        } else {
            showError("Camera access is not supported by your browser.");
            stopCameraStream(); // Clean up UI
        }
    }

    function takeSnapshot() {
        if (!currentStream || !videoElement.videoWidth) {
             console.warn("Stream not ready or video dimensions not available yet.");
             return;
        }

        const context = canvasElement.getContext('2d');
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        canvasElement.toBlob(async (blob) => {
             if (blob) {
                const fileName = `snapshot-${Date.now()}.jpg`;
                currentFile = new File([blob], fileName, { type: 'image/jpeg' });

                if (imagePreview.src.startsWith('blob:')) {
                    URL.revokeObjectURL(imagePreview.src);
                }
                imagePreview.src = URL.createObjectURL(currentFile);
                previewArea.style.display = 'block';
                analyzeButton.disabled = false; // Enable analysis
                speakButton.style.display = 'none'; // Hide speak button

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
    }

    async function analyzeImage() {
        if (!currentFile) {
            showError("Please select an image file or take a picture first.");
            return;
        }

        const selectedLanguage = languageSelect.value;
        const formData = new FormData();
        formData.append('image', currentFile, currentFile.name);
        formData.append('language', selectedLanguage);

        loadingElem.style.display = 'block';
        resultsArea.style.display = 'none';
        errorArea.style.display = 'none';
        analyzeButton.disabled = true;
        startCameraButton.disabled = true;
        imageInput.disabled = true;
        const fileLabel = document.querySelector('.file-label');
        if (fileLabel) fileLabel.style.pointerEvents = 'none';
        speakButton.style.display = 'none'; // Hide speak button during analysis

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server responded with status: ${response.status}`);
            }

            extractedTextElem.textContent = result.extracted_text || 'No text content received.';
            translatedTextElem.textContent = result.translated_text || 'No translation received.';
            translationLabelElem.innerHTML = `<i class="fa-solid fa-language"></i> Translated Text (${capitalizeFirstLetter(result.target_language || 'Unknown')}):`; // Update label with icon
            resultsArea.style.display = 'block';
            currentTranslationLanguage = result.target_language; // Store the language

            // Show speak button only if translation was successful and text exists
            if (result.translated_text && result.translated_text !== "No text to translate." && result.translated_text !== "Translation not possible due to extraction error.") {
                 speakButton.style.display = 'inline-flex'; // Show speak button
            }


        } catch (error) {
            console.error("Error during analysis:", error);
            showError(`Analysis failed: ${error.message}`);
            currentTranslationLanguage = null; // Reset language on error
            speakButton.style.display = 'none'; // Ensure speak button is hidden
        } finally {
            loadingElem.style.display = 'none';
            analyzeButton.disabled = false;
            startCameraButton.disabled = false;
            imageInput.disabled = false;
             if (fileLabel) fileLabel.style.pointerEvents = 'auto';
        }
    }

    // --- New Feature Handlers ---

    function handleCopyClick(event) {
        const button = event.currentTarget; // Use currentTarget for attached listener
        const targetId = button.dataset.target;
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            const textToCopy = targetElement.textContent;
            if (!textToCopy) {
                console.warn("Nothing to copy from:", targetId);
                return; // Nothing to copy
            }

            if (navigator.clipboard && window.isSecureContext) { // Check for secure context
                navigator.clipboard.writeText(textToCopy).then(() => {
                    // Success feedback
                    const originalText = button.innerHTML; // Store original content (including icon)
                    button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    button.disabled = true;
                    setTimeout(() => {
                        button.innerHTML = originalText;
                        button.disabled = false;
                    }, 1500); // Reset after 1.5 seconds
                }).catch(err => {
                    console.error("Failed to copy text: ", err);
                    showError("Could not copy text to clipboard."); // Show user error
                });
            } else {
                console.warn("Clipboard API not available or context is not secure.");
                // Basic fallback for older browsers (less reliable)
                try {
                   const textArea = document.createElement("textarea");
                   textArea.value = textToCopy;
                   textArea.style.position = "fixed"; // Prevent scrolling
                   textArea.style.opacity = "0";
                   document.body.appendChild(textArea);
                   textArea.focus();
                   textArea.select();
                   document.execCommand('copy');
                   document.body.removeChild(textArea);
                   // Add feedback here too
                   const originalText = button.innerHTML;
                   button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                   button.disabled = true;
                   setTimeout(() => {
                       button.innerHTML = originalText;
                       button.disabled = false;
                    }, 1500);
                } catch (e) {
                     showError("Copying failed. Please copy manually.");
                }
            }
        } else {
            console.error("Target element for copy not found:", targetId);
        }
    }

    function handleSpeakClick() {
         if (!('speechSynthesis' in window)) {
            showError("Sorry, your browser doesn't support text-to-speech.");
            return;
        }

        const textToSpeak = translatedTextElem.textContent;
        if (!textToSpeak || !currentTranslationLanguage) {
            console.warn("No translated text or language available to speak.");
            return;
        }

        // Stop any currently speaking utterance before starting a new one
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }


        const utterance = new SpeechSynthesisUtterance(textToSpeak);

        // Map our language value to a BCP 47 code
        const langCode = languageCodeMap[currentTranslationLanguage.toLowerCase()]; // Use lowercase key

        if (langCode) {
            utterance.lang = langCode;
        } else {
            console.warn(`No language code mapping found for: ${currentTranslationLanguage}. Using browser default.`);
            // Optional: Fallback to english or browser default if map fails
             // utterance.lang = 'en-US';
        }

        // Optional: You could try to select a specific voice here
        // const voices = window.speechSynthesis.getVoices();
        // utterance.voice = voices.find(voice => voice.lang === langCode);

        utterance.onerror = (event) => {
            console.error("SpeechSynthesisUtterance.onerror", event);
            showError(`Speech error: ${event.error}`);
        };

         utterance.onend = () => {
             speakButton.disabled = false; // Re-enable button when speech ends
         };

         utterance.onstart = () => {
            speakButton.disabled = true; // Disable button while speaking
         };


        // Speak the utterance
        window.speechSynthesis.speak(utterance);
    }


    // --- Helper Functions ---
    function showError(message) {
        errorMessageElem.textContent = message;
        errorArea.style.display = 'block';
        resultsArea.style.display = 'none';
        loadingElem.style.display = 'none';
        speakButton.style.display = 'none'; // Hide speak button on error
    }

    function resetState() {
        stopCameraStream();

        if (imagePreview.src.startsWith('blob:')) {
           URL.revokeObjectURL(imagePreview.src);
        }
        // Stop any ongoing speech synthesis
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
           window.speechSynthesis.cancel();
        }

        currentFile = null;
        imageInput.value = '';
        imagePreview.src = '#';
        previewArea.style.display = 'none';
        resultsArea.style.display = 'none';
        errorArea.style.display = 'none';
        analyzeButton.disabled = true;
        speakButton.style.display = 'none'; // Hide speak button
        currentTranslationLanguage = null; // Reset language

        // Reset copy button text/state if needed (optional)
        copyButtons.forEach(button => {
            const icon = button.querySelector('i');
            if(icon && icon.classList.contains('fa-check')){ // If it shows 'Copied'
                 button.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; // Reset
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
