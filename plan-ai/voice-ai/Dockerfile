FROM python:3.12-slim

# Install ffmpeg for torchaudio to support multiple formats (webm, mp4, etc.)
RUN apt-get update && apt-get install -y ffmpeg libsndfile1 wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml uv.lock ./

# Install the exact versions in uv.lock, the same ones local development uses.
# --frozen installs from the lock as it is, without resolving again.
RUN pip install --no-cache-dir uv
RUN uv sync --frozen --no-dev --no-cache
ENV PATH="/app/.venv/bin:$PATH"

RUN python -c "from speechbrain.inference.speaker import SpeakerRecognition; SpeakerRecognition.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', savedir='model')"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--timeout-keep-alive", "300"]
