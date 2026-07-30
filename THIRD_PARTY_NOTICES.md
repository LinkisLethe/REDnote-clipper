# Third-party notices

XHS Clipper includes or depends on the following third-party components.

## PaddleOCR and PP-OCRv6 Tiny

- Project: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)
- Browser documentation: [PaddleOCR.js](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html)
- Model documentation: [PP-OCRv6](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html)
- Included files: `public/models/PP-OCRv6_tiny_det_onnx_infer.tar` and `public/models/PP-OCRv6_tiny_rec_onnx_infer.tar`
- License: Apache License 2.0. The complete license text is in [LICENSE](LICENSE).

The image preprocessing and result decoding in XHS Clipper were independently implemented in TypeScript with reference to the public PaddleOCR.js behavior. XHS Clipper does not include the PaddleOCR.js package or OpenCV.

## ONNX Runtime Web

- Project: [ONNX Runtime](https://github.com/microsoft/onnxruntime)
- Package: `onnxruntime-web` 1.24.3
- License: MIT. The complete license text is in [LICENSES/onnxruntime-MIT.txt](LICENSES/onnxruntime-MIT.txt).

The package is installed from npm during the build. Generated extension packages contain its WebAssembly runtime files.
