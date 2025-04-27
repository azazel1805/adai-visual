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

    // --- State Variables ---
    let currentFile = null;
    let currentStream = null; // To hold the MediaStream object

    // --- Event Listeners ---

    // 1. File Input Change
    imageInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files && files[0]) {
            handleFileSelect(files[0]);
        } else {
            // If user cancels file selection, don't necessarily reset everything,
            // especially if a snapshot was previously taken. Only reset if no current file.
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

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                // Request video stream
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }, // Prefer back camera
                    audio: false
                });
                currentStream = stream; // Store stream
                videoElement.srcObject = stream;
                // Wait for metadata to load to prevent playing before dimensions are known
                videoElement.onloadedmetadata = () => {
                   videoElement.play();
                };


                // Update UI
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
             return; // No stream active or video not ready
        }

        const context = canvasElement.getContext('2d');
        // Set canvas dimensions to match video intrinsic size for best quality
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;

        // Draw the current video frame onto the canvas
        context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        // Convert canvas to a Blob, then to a File
        canvasElement.toBlob(async (blob) => {
             if (blob) {
                // Create a File object (more convenient for FormData)
                // Use a timestamp for a somewhat unique filename
                const fileName = `snapshot-${Date.now()}.jpg`;
                currentFile = new File([blob], fileName, { type: 'image/jpeg' });

                // Display the captured image in the preview area
                // Revoke previous object URL if one exists to free memory
                if (imagePreview.src.startsWith('blob:')) {
                    URL.revokeObjectURL(imagePreview.src);
                }
                imagePreview.src = URL.createObjectURL(currentFile); // Use createObjectURL for preview
                previewArea.style.display = 'block';
                analyzeButton.disabled = false; // Enable analysis

                // Stop the camera and hide the camera view
                stopCameraStream();

             } else {
                showError("Failed to capture snapshot.");
                stopCameraStream(); // Clean up even on failure
             }
        }, 'image/jpeg', 0.9); // Use JPEG format with 90% quality
    }

    function stopCameraStream() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop()); // Stop all tracks
            currentStream = null; // Clear the stream variable
        }
        // Reset UI related to camera
        videoElement.srcObject = null; // Remove stream from video element
        videoElement.onloadedmetadata = null; // Remove listener
        cameraArea.style.display = 'none';
        inputOptions.style.display = 'flex'; // Show upload/take picture buttons again
    }

    async function analyzeImage() {
        if (!currentFile) {
            showError("Please select an image file or take a picture first.");
            return;
        }

        const selectedLanguage = languageSelect.value;
        const formData = new FormData();
        formData.append('image', currentFile, currentFile.name); // Append file with its name
        formData.append('language', selectedLanguage);

        // --- UI Updates: Show loading, hide results/errors ---
        loadingElem.style.display = 'block';
        resultsArea.style.display = 'none';
        errorArea.style.display = 'none';
        analyzeButton.disabled = true; // Disable button during processing
        startCameraButton.disabled = true; // Disable camera button too
        imageInput.disabled = true; // Disable file input temporarily
        const fileLabel = document.querySelector('.file-label'); // Get label to disable
        if (fileLabel) fileLabel.style.pointerEvents = 'none'; // Disable clicks on label

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server responded with status: ${response.status}`);
            }

            // --- Update UI with results ---
            extractedTextElem.textContent = result.extracted_text || 'No text content received.';
            translatedTextElem.textContent = result.translated_text || 'No translation received.';
            translationLabelElem.textContent = `Translated Text (${capitalizeFirstLetter(result.target_language || 'Unknown')}):`;
            resultsArea.style.display = 'block';

        } catch (error) {
            console.error("Error during analysis:", error);
            showError(`Analysis failed: ${error.message}`);
            // Don't clear preview on analysis error, user might want to try again
        } finally {
            // --- UI Cleanup: Hide loading, re-enable buttons ---
            loadingElem.style.display = 'none';
            analyzeButton.disabled = false; // Re-enable analyze button (unless file is cleared)
            startCameraButton.disabled = false;
            imageInput.disabled = false;
             if (fileLabel) fileLabel.style.pointerEvents = 'auto'; // Re-enable clicks

            // Decide if you want to clear the file after analysis.
            // If you clear it, disable the analyze button again.
            // currentFile = null;
            // imageInput.value = '';
            // analyzeButton.disabled = true;
            // previewArea.style.display = 'none'; // Hide preview if clearing
        }
    }

    // --- Helper Functions ---
    function showError(message) {
        errorMessageElem.textContent = message;
        errorArea.style.display = 'block';
        resultsArea.style.display = 'none'; // Hide results when showing error
        loadingElem.style.display = 'none'; // Hide loading when showing error
    }

    function resetState() {
         // Clear file, preview, results, errors
         stopCameraStream(); // Ensure camera is off

         // Revoke object URL if it exists
         if (imagePreview.src.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview.src);
         }

         currentFile = null;
         imageInput.value = ''; // Clear file input selection
         imagePreview.src = '#';
         previewArea.style.display = 'none';
         resultsArea.style.display = 'none';
         errorArea.style.display = 'none';
         analyzeButton.disabled = true; // Disable analyze button until new input
    }


    function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // --- Initial State ---
     resetState(); // Call reset state initially to set up the correct initial UI


}); // End DOMContentLoaded
