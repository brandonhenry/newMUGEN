# Krita + ComfyUI Docker Backend

This folder contains the local ComfyUI backend used by Krita AI Diffusion.

## Start

```sh
docker compose -f infra/krita-comfyui/docker-compose.yml up -d
```

ComfyUI is available at:

```text
http://127.0.0.1:8188
```

Krita AI Diffusion is configured to use this as an external server.

## Stop

```sh
docker compose -f infra/krita-comfyui/docker-compose.yml stop
```

## Rebuild

```sh
docker compose -f infra/krita-comfyui/docker-compose.yml build
```

## Installed Model Set

The Docker model volume has a CPU-friendly SD1.5 starter set:

- `dreamshaper_8.safetensors`
- `clip-vision_vit-h.safetensors`
- `ip-adapter_sd15.safetensors`
- `control_v11p_sd15_inpaint_fp16.safetensors`
- `control_lora_rank128_v11f1e_sd15_tile_fp16.safetensors`
- `Hyper-SD15-8steps-CFG-lora.safetensors`
- `MAT_Places512_G_fp16.safetensors`
- `EasyNegative.safetensors`

This backend runs on CPU inside Docker on macOS. It is usable for setup and smaller tests, but generation will be much slower than a native Metal/MPS or cloud GPU backend.
