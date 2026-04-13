import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";

declare global {
  interface Window {
    FaceDetection: any;
    Camera: any;
  }
}

const CameraComponent: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [smileProb, setSmileProb] = useState<number>(0);

  
  const createModel = () => {
    const model = tf.sequential();

    
    model.add(tf.layers.conv2d({
      inputShape: [48, 48, 1],
      filters: 8,
      kernelSize: 3,
      activation: "relu",
    }));

    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));

    model.add(tf.layers.conv2d({
      filters: 16,
      kernelSize: 3,
      activation: "relu",
    }));

    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.flatten());
    model.add(tf.layers.dense({ units: 32, activation: "relu" }));
    model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));

    
    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

    return model;
  };

  useEffect(() => {
    if (!videoRef.current) return;

    let camera: any;
    let stream: MediaStream;
    let model: tf.Sequential;

    const setup = async () => {
      let camera: any;
    let stream: MediaStream;
    let model: tf.Sequential;
    let smoothedSmile = 0;
      await tf.setBackend("webgl");

      //  INITIALIZEd
      model = createModel();
      console.log("React CNN Model created successfully!");

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });

        videoRef.current!.srcObject = stream;

        await new Promise((res) => {
          videoRef.current!.onloadedmetadata = () => res(true);
        });

        const faceDetection = new window.FaceDetection({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4/${file}`,
        });

        faceDetection.setOptions({
          model: "short",
          minDetectionConfidence: 0.5,
        });

        faceDetection.onResults(async (results: any) => {
          if (!canvasRef.current || !videoRef.current) return;

          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.detections) {
            for (const detection of results.detections) {
              const box = detection.boundingBox;

              const x = box.xCenter * canvas.width - (box.width * canvas.width) / 2;
              const y = box.yCenter * canvas.height - (box.height * canvas.height) / 2;
              const w = box.width * canvas.width;
              const h = box.height * canvas.height;

              
              ctx.strokeStyle = "lime";
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, w, h);

              const cropCanvas = cropCanvasRef.current;
              if (!cropCanvas) continue;
              const cropCtx = cropCanvas.getContext("2d");
              if (!cropCtx) continue;

              const size = 48;
              cropCanvas.width = size;
              cropCanvas.height = size;

              cropCtx.drawImage(
                videoRef.current,
                x, y, w, h,
                0, 0, size, size
              );

              
              const rawPixels = tf.browser.fromPixels(cropCanvas);
              const tensor = rawPixels
                .resizeNearestNeighbor([48, 48])
                .mean(2) // Convert to Grayscale
                .toFloat()
                .div(255.0) // Normalize
                .expandDims(0)
                .expandDims(-1);

              
              const prediction = model.predict(tensor) as tf.Tensor;
              const cnnOutputData = await prediction.data();
              const cnnOutput = cnnOutputData[0];

              // 5 for my reference 
              const floatPixels = rawPixels.toFloat();
              const mouthRegion = floatPixels.slice([30, 10, 0], [18, 28, 3]); 
              const moments = tf.moments(mouthRegion);
              const varianceData = await moments.variance.data();
              const mouthVariance = varianceData[0];

            
              const baselineNoise = 800; 
              const adjustedVariance = Math.max(0, mouthVariance - baselineNoise);

            
              const rawSmileScore = Math.min(1, adjustedVariance / 1000);
              
              // 💡 3. EXPONENTIAL SMOOTHING: Fixes the flickering!
              // This takes 10% of the current frame and blends it with 90% of the past frames.
              // It creates a beautiful, smooth transition instead of jumping wildly.
              smoothedSmile = (rawSmileScore * 0.15) + (smoothedSmile * 0.85);

              setSmileProb(smoothedSmile);

             
              tf.dispose([
                rawPixels, 
                tensor, 
                prediction, 
                floatPixels, 
                mouthRegion, 
                moments.mean, 
                moments.variance
              ]);
            }
          }
        });

        camera = new window.Camera(videoRef.current!, {
          onFrame: async () => {
            await faceDetection.send({ image: videoRef.current });
          },
          width: 640,
          height: 480,
        });

        camera.start();
      } catch (err) {
        console.error(err);
      }
    };

    setup();

    return () => {
      if (camera) camera.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ position: "relative", width: 640, height: 480 }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
      <canvas ref={canvasRef} style={{ position: "absolute", width: "100%", height: "100%" }} />
      <canvas ref={cropCanvasRef} style={{ position: "absolute", bottom: 10, right: 10, border: "2px solid red" }} />
      <div style={{ position: "absolute", top: 10, left: 10, color: "white", background: "black", padding: "5px", zIndex: 10 }}>
        Actual Smile: {(smileProb * 100).toFixed(1)}%
      </div>
    </div>
  );
};

export default CameraComponent;