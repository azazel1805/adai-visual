document.addEventListener('DOMContentLoaded', () => {
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

    let currentFile = null;

    imageInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files && files[0]) {
            currentFile = files[0];
            const reader = new FileReader();

            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                previewArea.style.display = 'block';
                resultsArea.style.display = 'none'; // Hide old results
                errorArea.style.display = 'none';   // Hide old errors
            }
            reader.readAsDataURL(currentFile);
            analyzeButton.disabled = false; // Enable button once file is selected
        } else {
            currentFile = null;
            previewArea.style.display = 'none';
            analyzeButton.disabled = true; // Disable button if no file selected
        }
    });

    analyzeButton.addEventListener('click', async () => {
        if (!currentFile) {
            showError("Please select an image file first.");
            return;
        }

        const selectedLanguage = languageSelect.value;
        const formData = new FormData();
        formData.append('image', currentFile);
        formData.append('language', selectedLanguage);

        // --- UI Updates: Show loading, hide results/errors ---
        loadingElem.style.display = 'block';
        resultsArea.style.display = 'none';
        errorArea.style.display = 'none';
        analyzeButton.disabled = true; // Disable button during processing

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                body: formData,
                // No 'Content-Type' header needed; browser sets it for FormData
            });

            const result = await response.json();

            if (!response.ok) {
                // Handle errors from the server (e.g., validation, API errors)
                throw new Error(result.error || `Server responded with status: ${response.status}`);
            }

            // --- Update UI with results ---
            extractedTextElem.textContent = result.extracted_text || 'No text content received.';
            translatedTextElem.textContent = result.translated_text || 'No translation received.';
            translationLabelElem.textContent = `Translated Text (${capitalizeFirstLetter(result.target_language || 'Unknown')}):`;
            resultsArea.style.display = 'block';

        } catch (error) {
            console.error("Error during analysis:", error);
            showError(`An error occurred: ${error.message}`);
        } finally {
            // --- UI Cleanup: Hide loading, re-enable button ---
            loadingElem.style.display = 'none';
            // Keep button disabled until a new file is selected or page reloaded?
            // Or re-enable it? Let's re-enable it for easier re-tries.
             analyzeButton.disabled = false;
             // Reset file input for potential re-upload of the same file triggering 'change'
             imageInput.value = '';
             // Keep preview visible, but maybe clear currentFile? Let's keep it simple for now.
        }
    });

    // --- Helper Functions ---
    function showError(message) {
        errorMessageElem.textContent = message;
        errorArea.style.display = 'block';
        resultsArea.style.display = 'none'; // Hide results when showing error
        loadingElem.style.display = 'none'; // Hide loading when showing error
    }

     function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

     // Initially disable the button
     analyzeButton.disabled = true;
});