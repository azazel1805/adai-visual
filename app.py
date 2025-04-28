import os
import pathlib
import uuid # Make sure uuid is imported
from flask import Flask, request, render_template, jsonify
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import Image
import io # Needed for handling image bytes

# Load environment variables
load_dotenv()

# Configure Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
# Set a reasonable upload limit (e.g., 16MB)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Create upload folder if it doesn't exist
pathlib.Path(app.config['UPLOAD_FOLDER']).mkdir(parents=True, exist_ok=True)

# Configure Gemini API
try:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file")
    genai.configure(api_key=gemini_api_key)
    # Use a model suitable for vision tasks
    vision_model = genai.GenerativeModel('gemini-1.5-flash') # Or 'gemini-pro-vision', 'gemini-1.5-pro-latest'
    # Use a model potentially optimized for text/translation
    text_model = genai.GenerativeModel('gemini-1.5-flash') # Or 'gemini-pro', 'gemini-1.5-pro-latest'
except ValueError as e:
    print(f"Error configuring Gemini: {e}")
    vision_model = None
    text_model = None
except Exception as e:
    print(f"An unexpected error occurred during Gemini configuration: {e}")
    vision_model = None
    text_model = None

def allowed_file(filename):
    """Checks if the file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def process_uploaded_image(file_storage):
    """Validates, saves, opens, and returns image object and filepath."""
    if not file_storage or file_storage.filename == '':
        raise ValueError("No image selected or file name is empty.")

    if not allowed_file(file_storage.filename):
        raise ValueError(f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}")

    # Secure the filename part before the extension
    original_filename_parts = file_storage.filename.rsplit('.', 1)
    safe_base = secure_filename(original_filename_parts[0]) if len(original_filename_parts) > 1 else secure_filename(file_storage.filename)
    extension = original_filename_parts[1].lower() if len(original_filename_parts) > 1 else ''

    # Create a unique filename using UUID
    filename = f"{safe_base}_{uuid.uuid4()}.{extension}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    try:
        file_storage.save(filepath)
        img = Image.open(filepath)
        # Ensure image is in RGB format for consistency
        if img.mode != 'RGB':
            img = img.convert('RGB')
        return img, filepath # Return both PIL image and filepath for cleanup
    except Exception as e:
        # Attempt cleanup if save worked but open/convert failed
        if os.path.exists(filepath):
             try:
                 os.remove(filepath)
             except Exception as cleanup_error:
                 print(f"Nested error during cleanup: {cleanup_error}")
        raise IOError(f"Error processing image file: {e}")


@app.route('/')
def index():
    """Renders the main HTML page."""
    return render_template('index.html')


@app.route('/analyze', methods=['POST'])
def analyze_image():
    """Handles text extraction and translation."""
    if not vision_model or not text_model:
         return jsonify({"error": "Gemini API not configured correctly."}), 500

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    target_language = request.form.get('language', 'english') # Default to English
    img = None
    filepath = None

    try:
        img, filepath = process_uploaded_image(file) # Use helper

        # --- Text Extraction ---
        print(f"Analyzing image for text: {filepath}")
        extraction_prompt = "Extract all visible text from this image. If no text is present, respond with 'No text found.'."
        extraction_response = vision_model.generate_content([extraction_prompt, img], stream=False)
        extraction_response.resolve()

        # Safer access to response text
        if extraction_response.candidates and extraction_response.candidates[0].content.parts:
            extracted_text = extraction_response.text.strip()
        else:
             extracted_text = "Error: Could not get text extraction response from Vision model."
             # Check safety ratings if available and needed:
             # if extraction_response.prompt_feedback.block_reason:
             #    extracted_text = f"Content blocked: {extraction_response.prompt_feedback.block_reason}"
        print(f"Extracted text: {extracted_text}")


        # --- Translation ---
        translated_text = ""
        if extracted_text and extracted_text != "No text found." and not extracted_text.startswith("Error:"):
            print(f"Translating to: {target_language}")
            translation_prompt = f"Translate the following text to {target_language}: '{extracted_text}'"
            translation_response = text_model.generate_content(translation_prompt, stream=False)
            translation_response.resolve()

            if translation_response.candidates and translation_response.candidates[0].content.parts:
                 translated_text = translation_response.text.strip()
            else:
                 translated_text = "Error: Could not get translation response from Text model."
                 # Check safety ratings if available and needed:
                 # if translation_response.prompt_feedback.block_reason:
                 #    translated_text = f"Content blocked: {translation_response.prompt_feedback.block_reason}"
            print(f"Translated text: {translated_text}")

        elif extracted_text == "No text found.":
            translated_text = "No text to translate."
        else:
             # Handle the extraction error case - no translation possible
             translated_text = "Translation not possible due to extraction error."

        return jsonify({
            "extracted_text": extracted_text,
            "translated_text": translated_text,
            "target_language": target_language
        })

    except (ValueError, IOError) as e: # Catch specific errors from helper
        print(f"File processing error in /analyze: {e}")
        # Ensure filepath is None if error occurred before assignment
        if 'filepath' in locals() and not os.path.exists(filepath): filepath = None
        return jsonify({"error": str(e)}), 400
    except genai.types.generation_types.BlockedPromptException as e:
         print(f"Gemini API Error (Blocked Prompt) in /analyze: {e}")
         return jsonify({"error": f"Content blocked by API safety settings."}), 500
    except Exception as e:
        print(f"An unexpected error occurred during analysis: {e}")
        # Log the full traceback for debugging
        import traceback
        traceback.print_exc()
        return jsonify({"error": "An internal server error occurred during analysis"}), 500
    finally:
        # --- Cleanup ---
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                print(f"Deleted image after analysis: {filepath}")
            except Exception as cleanup_e:
                print(f"Error cleaning up file {filepath} after analysis: {cleanup_e}")


@app.route('/identify', methods=['POST'])
def identify_route():
    """Handles object identification."""
    if not vision_model:
        return jsonify({"error": "Gemini Vision API not configured correctly."}), 500

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    img = None
    filepath = None

    try:
        img, filepath = process_uploaded_image(file) # Reuse helper

        # --- Object Identification ---
        print(f"Identifying objects in image: {filepath}")
        identification_prompt = "Describe the main objects and overall scene shown in this image in a concise paragraph."

        response = vision_model.generate_content([identification_prompt, img], stream=False)
        response.resolve() # Ensure completion

        # Safer access to response text
        if response.candidates and response.candidates[0].content.parts:
            identified_objects_text = response.text.strip()
        else:
            identified_objects_text = "Could not identify objects or describe the scene."
            # Check safety ratings if available and needed:
            # if response.prompt_feedback.block_reason:
            #    identified_objects_text = f"Content blocked: {response.prompt_feedback.block_reason}"

        print(f"Identified objects/scene: {identified_objects_text}")

        return jsonify({
            "identified_objects": identified_objects_text
        })

    except (ValueError, IOError) as e: # Catch specific errors from helper
        print(f"File processing error in /identify: {e}")
        if 'filepath' in locals() and not os.path.exists(filepath): filepath = None
        return jsonify({"error": str(e)}), 400
    except genai.types.generation_types.BlockedPromptException as e:
         print(f"Gemini API Error (Blocked Prompt) in /identify: {e}")
         return jsonify({"error": f"Content blocked by API safety settings."}), 500
    except Exception as e:
        print(f"An unexpected error occurred during identification: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "An internal server error occurred during identification"}), 500
    finally:
        # --- Cleanup ---
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                print(f"Deleted image after identification: {filepath}")
            except Exception as cleanup_e:
                print(f"Error cleaning up file {filepath} after identification: {cleanup_e}")


if __name__ == '__main__':
    # Set debug=False when deploying to production (like Render)
    # Render uses Gunicorn specified in Procfile, not this block for production.
    app.run(debug=True)
