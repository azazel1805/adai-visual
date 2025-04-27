import os
import pathlib
from flask import Flask, request, render_template, jsonify
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import Image
import uuid # To generate unique filenames

# Load environment variables
load_dotenv()

# Configure Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB upload limit
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Create upload folder if it doesn't exist
pathlib.Path(app.config['UPLOAD_FOLDER']).mkdir(parents=True, exist_ok=True)

# Configure Gemini API
try:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file")
    genai.configure(api_key=gemini_api_key)
    # Using gemini-1.5-flash as it's generally faster and cheaper for vision tasks
    # You could also use gemini-pro-vision or gemini-1.5-pro-latest
    vision_model = genai.GenerativeModel('gemini-1.5-flash')
    # Using a separate model optimized for text generation/translation might be better,
    # but we can try using the vision model for both first for simplicity.
    # If translation quality is poor, switch to 'gemini-pro' or 'gemini-1.5-pro-latest' for translation part.
    text_model = genai.GenerativeModel('gemini-1.5-flash') # or 'gemini-pro'
except ValueError as e:
    print(f"Error configuring Gemini: {e}")
    # You might want to exit or handle this more gracefully in a real app
    vision_model = None
    text_model = None
except Exception as e:
    print(f"An unexpected error occurred during Gemini configuration: {e}")
    vision_model = None
    text_model = None


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """Renders the main page."""
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze_image():
    """Handles image upload, text extraction, and translation."""
    if not vision_model or not text_model:
         return jsonify({"error": "Gemini API not configured correctly."}), 500

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    target_language = request.form.get('language', 'english') # Default to English

    if file.filename == '':
        return jsonify({"error": "No image selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type. Allowed types: png, jpg, jpeg, gif, webp"}), 400

    if file:
        # Create a unique filename to prevent overwrites and potential security issues
        filename = secure_filename(f"{uuid.uuid4()}.{file.filename.rsplit('.', 1)[1].lower()}")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        try:
            file.save(filepath)

            # --- Text Extraction using Gemini ---
            print(f"Analyzing image: {filepath}")
            img = Image.open(filepath)

            # Prepare prompt for text extraction
            extraction_prompt = "Extract all visible text from this image. If no text is present, respond with 'No text found.'."

            # Make the API call for extraction
            extraction_response = vision_model.generate_content([extraction_prompt, img], stream=False)
            extraction_response.resolve() # Wait for the response to complete

            if not extraction_response.candidates or not extraction_response.candidates[0].content.parts:
                 extracted_text = "Error: Could not get response from Gemini Vision model."
            else:
                extracted_text = extraction_response.text.strip()
                print(f"Extracted text: {extracted_text}")


            # --- Translation using Gemini ---
            translated_text = ""
            if extracted_text and extracted_text != "No text found." and extracted_text != "Error: Could not get response from Gemini Vision model.":
                # Prepare prompt for translation
                translation_prompt = f"Translate the following text to {target_language}: '{extracted_text}'"
                print(f"Translating to: {target_language}")

                # Make the API call for translation
                translation_response = text_model.generate_content(translation_prompt, stream=False)
                translation_response.resolve()

                if not translation_response.candidates or not translation_response.candidates[0].content.parts:
                     translated_text = "Error: Could not get translation response from Gemini model."
                else:
                    translated_text = translation_response.text.strip()
                    print(f"Translated text: {translated_text}")
            elif extracted_text == "No text found.":
                translated_text = "No text to translate." # Or translate "No text found." if desired
            else:
                # Handle the extraction error case - no translation possible
                 translated_text = "Translation not possible due to extraction error."


            # --- Cleanup ---
            # Delete the uploaded file after processing
            os.remove(filepath)
            print(f"Deleted image: {filepath}")

            return jsonify({
                "extracted_text": extracted_text,
                "translated_text": translated_text,
                "target_language": target_language
            })

        except genai.types.generation_types.BlockedPromptException as e:
             print(f"Gemini API Error (Blocked Prompt): {e}")
             if os.path.exists(filepath): # Attempt cleanup on error
                 os.remove(filepath)
             return jsonify({"error": f"Content blocked by API safety settings."}), 500
        except genai.types.generation_types.StopCandidateException as e:
             print(f"Gemini API Error (Stopped Candidate): {e}")
             if os.path.exists(filepath): # Attempt cleanup on error
                 os.remove(filepath)
             return jsonify({"error": f"API response generation stopped unexpectedly."}), 500
        except Exception as e:
            print(f"An error occurred: {e}")
            # Attempt to clean up the file even if an error occurred
            if 'filepath' in locals() and os.path.exists(filepath):
                try:
                    os.remove(filepath)
                    print(f"Deleted image after error: {filepath}")
                except Exception as cleanup_e:
                    print(f"Error cleaning up file {filepath}: {cleanup_e}")
            return jsonify({"error": "An internal server error occurred"}), 500

    return jsonify({"error": "An unknown error occurred"}), 500

if __name__ == '__main__':
    # Use debug=True only for local development, NOT for production on Render
    app.run(debug=True)
