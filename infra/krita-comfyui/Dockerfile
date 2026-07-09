FROM python:3.12-slim

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        git \
        git-lfs \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

RUN git clone --depth=1 https://github.com/comfyanonymous/ComfyUI.git

WORKDIR /opt/ComfyUI

RUN python -m pip install --upgrade pip \
    && pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt

RUN git clone --depth=1 https://github.com/Fannovel16/comfyui_controlnet_aux.git custom_nodes/comfyui_controlnet_aux \
    && git clone --depth=1 https://github.com/cubiq/ComfyUI_IPAdapter_plus.git custom_nodes/ComfyUI_IPAdapter_plus \
    && git clone --depth=1 https://github.com/Acly/comfyui-inpaint-nodes.git custom_nodes/comfyui-inpaint-nodes \
    && git clone --depth=1 https://github.com/Acly/comfyui-tooling-nodes.git custom_nodes/comfyui-tooling-nodes \
    && for requirements in custom_nodes/*/requirements.txt; do \
        sed '/^onnxruntime-gpu/d' "$requirements" > /tmp/custom-node-requirements.txt \
        && pip install -r /tmp/custom-node-requirements.txt; \
    done

EXPOSE 8188

CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188", "--cpu"]
