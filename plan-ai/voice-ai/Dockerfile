FROM python:3.10-slim

# Install ffmpeg for torchaudio to support multiple formats (webm, mp4, etc.)
RUN apt-get update && apt-get install -y ffmpeg libsndfile1 wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install uv and use it to install dependencies lightning fast
RUN pip install --no-cache-dir uv
RUN uv pip install --system --no-cache -r requirements.txt

RUN python -c "from speechbrain.inference.speaker import SpeakerRecognition; SpeakerRecognition.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', savedir='model')"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--timeout-keep-alive", "300"]
