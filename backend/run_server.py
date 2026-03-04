from waitress import serve
from app import app

print("Starting Flask with Waitress...")

serve(app, host="0.0.0.0", port=8000)